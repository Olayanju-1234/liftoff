import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, TenantStatus } from '.prisma/tenant-client';
import { PrismaService } from '../prisma.service';
import { errorMessage } from '../common/error-message';

export const ROLLING_DAY_MS = 24 * 60 * 60 * 1000;
// A full tenant must be deleted or cancelled before another fits; an hour is a sane poll.
export const ACTIVE_LIMIT_RETRY_AFTER_S = 3600;

export class QuotaExceededException extends HttpException {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message,
        error: 'Too Many Requests',
        retryAfter: retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export interface QuotaUsage {
  activeTenants: number;
  maxActiveTenants: number;
  provisionsToday: number;
  maxProvisionsPerDay: number;
}

// Tenants that hold a schema and may still go ACTIVE. Cancelled, failed and test ones don't count.
const countsAsActive: Prisma.TenantWhereInput = {
  isWorkspace: false,
  isTest: false,
  status: { in: [TenantStatus.PROVISIONING, TenantStatus.ACTIVE] },
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function describeWait(seconds: number): string {
  if (seconds < 90) {
    return plural(Math.max(1, seconds), 'second');
  }
  if (seconds < 90 * 60) {
    return plural(Math.ceil(seconds / 60), 'minute');
  }
  return plural(Math.ceil(seconds / 3600), 'hour');
}

@Injectable()
export class QuotasService {
  private readonly logger = new Logger(QuotasService.name);

  constructor(private readonly prisma: PrismaService) {}

  async usage(organisationId: string): Promise<QuotaUsage> {
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: organisationId },
      select: { maxActiveTenants: true, maxProvisionsPerDay: true },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    const [activeTenants, provisionsToday] = await Promise.all([
      this.prisma.tenant.count({
        where: { organisationId, ...countsAsActive },
      }),
      this.prisma.provisionLog.count({
        where: { organisationId, createdAt: { gte: this.windowStart() } },
      }),
    ]);
    return { ...organisation, activeTenants, provisionsToday };
  }

  // Throws 429 (with how long to wait) when another tenant would exceed a limit.
  // Two requests in the same instant can both pass; the limits are a brake, not a ledger.
  async assertCanProvision(organisationId: string): Promise<QuotaUsage> {
    const usage = await this.usage(organisationId);
    if (usage.activeTenants >= usage.maxActiveTenants) {
      this.logger.warn(
        `Organisation ${organisationId} is at its active tenant limit ${JSON.stringify(usage)}`,
      );
      throw new QuotaExceededException(
        `Your organisation has ${plural(usage.activeTenants, 'active tenant')} and the limit is ${usage.maxActiveTenants}. Delete or cancel one, or contact support to raise the limit. Test tenants (test: true) don't count.`,
        ACTIVE_LIMIT_RETRY_AFTER_S,
      );
    }
    if (usage.provisionsToday >= usage.maxProvisionsPerDay) {
      const retryAfter = await this.secondsUntilWindowFrees(organisationId);
      this.logger.warn(
        `Organisation ${organisationId} is at its daily provisioning limit ${JSON.stringify(usage)}`,
      );
      throw new QuotaExceededException(
        `Your organisation has started ${plural(usage.provisionsToday, 'tenant')} in the last 24 hours and the limit is ${usage.maxProvisionsPerDay}. Try again in about ${describeWait(retryAfter)}, or contact support to raise the limit. Test tenants (test: true) don't count.`,
        retryAfter,
      );
    }
    return usage;
  }

  // Best effort: the tenant exists either way, so a failed write must not fail the request.
  async record(organisationId: string, tenantId: string): Promise<void> {
    try {
      await this.prisma.provisionLog.create({
        data: { organisationId, tenantId },
      });
    } catch (error) {
      this.logger.error(
        `Could not record the provision of ${tenantId} for organisation ${organisationId}: ${errorMessage(error)}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async purgeOld(): Promise<number> {
    try {
      const { count } = await this.prisma.provisionLog.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - 2 * ROLLING_DAY_MS) } },
      });
      if (count > 0) {
        this.logger.log(
          `Purged ${count} provision log row(s) older than two days`,
        );
      }
      return count;
    } catch (error) {
      this.logger.error(
        `Could not purge the provision log: ${errorMessage(error)}`,
      );
      return 0;
    }
  }

  private windowStart(): Date {
    return new Date(Date.now() - ROLLING_DAY_MS);
  }

  private async secondsUntilWindowFrees(
    organisationId: string,
  ): Promise<number> {
    const oldest = await this.prisma.provisionLog.findFirst({
      where: { organisationId, createdAt: { gte: this.windowStart() } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    if (!oldest) {
      return 1;
    }
    const freesAt = oldest.createdAt.getTime() + ROLLING_DAY_MS;
    return Math.max(1, Math.ceil((freesAt - Date.now()) / 1000));
  }
}
