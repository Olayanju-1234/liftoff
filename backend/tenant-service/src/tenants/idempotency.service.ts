import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { Prisma } from '.prisma/tenant-client';
import { IDEMPOTENCY_KEY_MAX_LENGTH } from '@liftoff/shared-types';
import { PrismaService } from '../prisma.service';
import { errorMessage } from '../common/error-message';

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export interface IdempotentResult<T> {
  body: T;
  replayed: boolean;
}

// Key order must not change the hash: a retried request is the same request.
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export const hashRequest = (body: unknown): string =>
  createHash('sha256').update(stableStringify(body)).digest('hex');

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Runs `execute` at most once per (organisation, key) for 24 h and replays its
  // result afterwards. A repeat with a different body is refused with 422.
  async run<T>(
    organisationId: string,
    key: string,
    request: unknown,
    execute: () => Promise<T>,
  ): Promise<IdempotentResult<T>> {
    if (key.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
      throw new BadRequestException(
        `Idempotency-Key must be at most ${IDEMPOTENCY_KEY_MAX_LENGTH} characters`,
      );
    }
    const requestHash = hashRequest(request);

    const replay = await this.reserve(organisationId, key, requestHash);
    if (replay !== null) {
      this.logger.log(
        `Replaying POST /tenants for organisation ${organisationId} (Idempotency-Key ${key})`,
      );
      return { body: replay as T, replayed: true };
    }

    let body: T;
    try {
      body = await execute();
    } catch (error) {
      // Nothing was stored for this key, so the caller may retry with it.
      await this.release(organisationId, key);
      throw error;
    }

    // The same JSON the client got: dates become strings here as they do on the wire.
    const response = JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue;
    try {
      await this.prisma.idempotencyKey.update({
        where: { organisationId_key: { organisationId, key } },
        data: { response },
      });
    } catch (error) {
      this.logger.error(
        `Could not store the response for Idempotency-Key ${key}: ${errorMessage(error)}`,
      );
    }
    return { body, replayed: false };
  }

  // Returns the stored response to replay, or null when this call now owns the key.
  private async reserve(
    organisationId: string,
    key: string,
    requestHash: string,
    retry = true,
  ): Promise<Prisma.JsonValue | null> {
    try {
      await this.prisma.idempotencyKey.create({
        data: {
          organisationId,
          key,
          requestHash,
          expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
        },
      });
      return null;
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
    }

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { organisationId_key: { organisationId, key } },
    });
    if (!existing) {
      // Released between the failed insert and this read; take it now.
      return retry
        ? this.reserve(organisationId, key, requestHash, false)
        : null;
    }
    if (existing.expiresAt <= new Date()) {
      await this.prisma.idempotencyKey.deleteMany({
        where: { id: existing.id, expiresAt: existing.expiresAt },
      });
      return retry
        ? this.reserve(organisationId, key, requestHash, false)
        : null;
    }
    if (existing.requestHash !== requestHash) {
      throw new UnprocessableEntityException(
        'This Idempotency-Key was already used with a different request body. Use a new key for a new request.',
      );
    }
    if (existing.response === null) {
      throw new ConflictException(
        'A request with this Idempotency-Key is still being processed. Retry in a moment to get its result.',
      );
    }
    return existing.response;
  }

  private async release(organisationId: string, key: string): Promise<void> {
    try {
      await this.prisma.idempotencyKey.deleteMany({
        where: { organisationId, key, response: { equals: Prisma.DbNull } },
      });
    } catch (error) {
      this.logger.error(
        `Could not release Idempotency-Key ${key}: ${errorMessage(error)}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpired(): Promise<number> {
    try {
      const { count } = await this.prisma.idempotencyKey.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      if (count > 0) {
        this.logger.log(`Purged ${count} expired idempotency key(s)`);
      }
      return count;
    } catch (error) {
      this.logger.error(
        `Could not purge expired idempotency keys: ${errorMessage(error)}`,
      );
      return 0;
    }
  }
}
