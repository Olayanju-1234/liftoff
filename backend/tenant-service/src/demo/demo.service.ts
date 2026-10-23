import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomInt } from 'crypto';
import {
  Prisma,
  type DemoTenant,
  type EventLog,
  type Tenant,
} from '.prisma/tenant-client';
import {
  DEFAULT_CUSTOMER_PLANS,
  type DemoInfo,
  type DemoStarted,
  type StartDemoDto,
} from '@liftoff/shared-types';
import { PrismaService } from '../prisma.service';
import { errorMessage } from '../common/error-message';
import { TenantsService } from '../tenants/tenants.service';
import { StatusTokenService } from '../status/status-token.service';
import { hashStatusToken } from '../status/status-token';
import { tenantAddress } from '../tenants/address';
import { isStepName, storedStepModes } from '../tenants/steps';
import { planNameFor } from '../organisations/customer-plans';

export const DEMO_HANDLE = 'liftoff-demo';
export const DEMO_ORGANISATION_NAME = 'liftoff demo';
export const DEMO_PLAN_ID = 'pro';
export const DEMO_TTL_MS = 15 * 60_000;
// Runs not yet removed; each holds a Postgres schema on a small shared box.
export const DEMO_MAX_LIVE = 20;
export const DEMO_BUSY_RETRY_AFTER_S = 60;
const SWEEP_BATCH = 25;
const EVENTS_SHOWN = 100;

const NAMES = [
  'Kestrel',
  'Lumen',
  'Tidewater',
  'Copperleaf',
  'Bluebird',
  'Fieldstone',
  'Larkspur',
  'Driftwood',
];

export class DemoBusyException extends HttpException {
  readonly retryAfterSeconds = DEMO_BUSY_RETRY_AFTER_S;

  constructor() {
    super(
      `The live demo is busy (${DEMO_MAX_LIVE} runs going). Try again in a minute.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

// What a demo run shows: the tenant fields the dashboard's pipeline views read, nothing
// that belongs to the demo organisation itself.
export interface DemoTenantView {
  id: string;
  name: string;
  subdomain: string;
  status: Tenant['status'];
  planId: string;
  planName: string;
  dbStatus: Tenant['dbStatus'];
  dnsStatus: Tenant['dnsStatus'];
  credentialsStatus: Tenant['credentialsStatus'];
  billingStatus: Tenant['billingStatus'];
  notificationStatus: Tenant['notificationStatus'];
  teardownDbStatus: Tenant['teardownDbStatus'];
  teardownCredentialsStatus: Tenant['teardownCredentialsStatus'];
  teardownBillingStatus: Tenant['teardownBillingStatus'];
  stepModes: ReturnType<typeof storedStepModes>;
  address: string;
  schemaName: string | null;
  isTest: boolean;
  statusUrl: string;
  stripeCustomerId: null;
  stripeSubscriptionId: null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DemoView {
  tenant: DemoTenantView;
  demo: DemoInfo;
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

function demoName(): { name: string; subdomain: string } {
  const word = NAMES[randomInt(NAMES.length)];
  const letters = Array.from({ length: 4 }, () =>
    String.fromCharCode(97 + randomInt(26)),
  ).join('');
  return {
    name: `${word} ${letters.toUpperCase()}`,
    subdomain: `${word.toLowerCase()}${letters}`,
  };
}

@Injectable()
export class DemoService implements OnModuleInit {
  private readonly logger = new Logger(DemoService.name);
  private organisationId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantsService,
    private readonly statusTokens: StatusTokenService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.demoOrganisationId();
    } catch (error) {
      // The first visitor tries again; the rest of the service must still boot.
      this.logger.error(
        `Live demo organisation unavailable: ${errorMessage(error)}`,
      );
    }
  }

  async start(dto: StartDemoDto): Promise<DemoStarted> {
    const organisationId = await this.demoOrganisationId();
    const live = await this.prisma.demoTenant.count({
      where: { removedAt: null },
    });
    if (live >= DEMO_MAX_LIVE) {
      throw new DemoBusyException();
    }

    const expiresAt = new Date(Date.now() + DEMO_TTL_MS);
    const tenant = await this.tenants.create(
      { ...demoName(), planId: DEMO_PLAN_ID, test: true },
      { organisationId, ownerId: null },
      { failStep: dto.failStep ?? null, expiresAt },
    );
    this.logger.log(
      `Demo run ${tenant.id} started${dto.failStep ? `, failing ${dto.failStep} once` : ''}`,
    );
    return {
      token: this.statusTokens.tokenFor(tenant.id),
      statusUrl: tenant.statusUrl,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async view(token: string): Promise<DemoView> {
    return this.present(await this.findRun(token));
  }

  async events(token: string): Promise<EventLog[]> {
    const { id } = await this.findRun(token);
    return this.prisma.eventLog.findMany({
      where: { tenantId: id },
      orderBy: { timestamp: 'desc' },
      take: EVENTS_SHOWN,
    });
  }

  async retry(token: string): Promise<DemoView> {
    const run = await this.findRun(token);
    await this.tenants.retry(run.id, await this.demoOrganisationId());
    return this.view(token);
  }

  // Removal is the ordinary teardown: a test tenant reads DELETED at once while the
  // workers drop its schema and revoke its keys.
  @Cron(CronExpression.EVERY_MINUTE)
  async removeExpired(): Promise<number> {
    const due = await this.prisma.demoTenant.findMany({
      where: { removedAt: null, expiresAt: { lte: new Date() } },
      select: { tenantId: true },
      orderBy: { expiresAt: 'asc' },
      take: SWEEP_BATCH,
    });
    if (due.length === 0) {
      return 0;
    }
    const organisationId = await this.demoOrganisationId();
    const results = await Promise.all(
      due.map(async ({ tenantId }) => {
        try {
          await this.tenants.delete(tenantId, organisationId);
          await this.prisma.demoTenant.update({
            where: { tenantId },
            data: { removedAt: new Date() },
          });
          return true;
        } catch (error) {
          this.logger.error(
            `Could not remove demo run ${tenantId}: ${errorMessage(error)}`,
          );
          return false;
        }
      }),
    );
    const removed = results.filter(Boolean).length;
    this.logger.log(`Removed ${removed} of ${due.length} expired demo run(s)`);
    return removed;
  }

  private async findRun(token: string): Promise<Tenant & { demo: DemoTenant }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { statusTokenHash: hashStatusToken(token) },
      include: { demo: true },
    });
    if (!tenant?.demo) {
      throw new NotFoundException('No demo run matches this link');
    }
    return { ...tenant, demo: tenant.demo };
  }

  private present(run: Tenant & { demo: DemoTenant }): DemoView {
    const { demo } = run;
    return {
      tenant: {
        id: run.id,
        name: run.name,
        subdomain: run.subdomain,
        status: run.status,
        planId: run.planId,
        planName: planNameFor([...DEFAULT_CUSTOMER_PLANS], run.planId),
        dbStatus: run.dbStatus,
        dnsStatus: run.dnsStatus,
        credentialsStatus: run.credentialsStatus,
        billingStatus: run.billingStatus,
        notificationStatus: run.notificationStatus,
        teardownDbStatus: run.teardownDbStatus,
        teardownCredentialsStatus: run.teardownCredentialsStatus,
        teardownBillingStatus: run.teardownBillingStatus,
        stepModes: storedStepModes(run.stepModes),
        address: tenantAddress(run.subdomain, null),
        schemaName: run.schemaName,
        isTest: run.isTest,
        statusUrl: this.statusTokens.urlFor(run.id),
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        cancelledAt: run.cancelledAt,
        cancelReason: run.cancelReason,
        deletedAt: run.deletedAt,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
      },
      demo: {
        failStep: isStepName(demo.failStep) ? demo.failStep : null,
        failedOnPurposeAt: demo.failInjectedAt?.toISOString() ?? null,
        expiresAt: demo.expiresAt.toISOString(),
      },
    };
  }

  // Found by its flag, not its handle, so a company that registered the handle first is
  // never mistaken for it; the demo then stays off.
  private async demoOrganisationId(): Promise<string> {
    if (this.organisationId) {
      return this.organisationId;
    }
    const existing = await this.prisma.organisation.findFirst({
      where: { isDemo: true },
      select: { id: true },
    });
    if (existing) {
      this.organisationId = existing.id;
      return existing.id;
    }
    try {
      const created = await this.prisma.organisation.create({
        data: {
          name: DEMO_ORGANISATION_NAME,
          handle: DEMO_HANDLE,
          isDemo: true,
        },
        select: { id: true },
      });
      this.logger.log(`Created the live demo organisation ${created.id}`);
      this.organisationId = created.id;
      return created.id;
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const raced = await this.prisma.organisation.findFirst({
        where: { isDemo: true },
        select: { id: true },
      });
      if (raced) {
        this.organisationId = raced.id;
        return raced.id;
      }
      this.logger.error(
        `The handle "${DEMO_HANDLE}" belongs to a company, so the live demo is off`,
      );
      throw new ServiceUnavailableException(
        'The live demo is not available right now.',
      );
    }
  }
}
