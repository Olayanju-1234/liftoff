import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '.prisma/tenant-client';
import { PrismaService } from '../prisma.service';
import { errorMessage } from '../common/error-message';
import type { ApiKeyPrincipal } from '../auth/principal';
import { generateApiKey, hashApiKey } from './api-key';

export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface CreatedApiKey extends ApiKeySummary {
  // The full key. This is the only response that ever contains it.
  key: string;
}

const summary = {
  id: true,
  name: true,
  prefix: true,
  lastUsedAt: true,
  createdAt: true,
} satisfies Prisma.ApiKeySelect;

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(organisationId: string, name: string): Promise<CreatedApiKey> {
    const { key, prefix, keyHash } = generateApiKey();
    const created = await this.prisma.apiKey.create({
      data: { organisationId, name, prefix, keyHash },
      select: summary,
    });
    this.logger.log(
      `Created API key ${created.id} (${prefix}…) for organisation ${organisationId}`,
    );
    return { ...created, key };
  }

  list(organisationId: string): Promise<ApiKeySummary[]> {
    return this.prisma.apiKey.findMany({
      where: { organisationId },
      select: summary,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Another organisation's key reads as missing, so ids can't be probed.
  async revoke(organisationId: string, id: string): Promise<void> {
    const { count } = await this.prisma.apiKey.deleteMany({
      where: { id, organisationId },
    });
    if (count === 0) {
      throw new NotFoundException(`API key ${id} not found`);
    }
    this.logger.log(`Revoked API key ${id} for organisation ${organisationId}`);
  }

  async authenticate(key: string): Promise<ApiKeyPrincipal> {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(key) },
      select: { id: true, organisationId: true },
    });
    if (!apiKey) {
      throw new UnauthorizedException('Invalid API key');
    }
    // Best effort: a failed bookkeeping write must not fail the request.
    this.prisma.apiKey
      .update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      })
      .catch((error: unknown) =>
        this.logger.warn(
          `Could not record use of API key ${apiKey.id}: ${errorMessage(error)}`,
        ),
      );
    return {
      kind: 'api-key',
      apiKeyId: apiKey.id,
      organisationId: apiKey.organisationId,
    };
  }
}
