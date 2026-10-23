import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomInt } from 'crypto';
import { Prisma, TenantStatus } from '.prisma/tenant-client';
import type {
  CreateDemoTenantDto,
  DemoFailStep,
  DemoTenantCreated,
  DemoTenantView,
} from '@liftoff/shared-types';
import { PrismaService } from '../prisma.service';
import { errorMessage } from '../common/error-message';
import { TenantsService } from '../tenants/tenants.service';
import {
  QuotaExceededException,
  describeWait,
} from '../tenants/quotas.service';
import { StatusTokenService } from '../status/status-token.service';
import { tenantAddress } from '../tenants/address';
import { storedStepModes } from '../tenants/steps';
import { effectivePlans, planNameFor } from '../organisations/customer-plans';
import {
  DEMO_FULL_RETRY_AFTER_S,
  DEMO_LIFETIME_MS,
  DEMO_MAX_LIVE,
  DEMO_MAX_PER_IP_PER_HOUR,
  DEMO_ORGANISATION_ID,
  DEMO_PLAN_ID,
  DEMO_RATE_WINDOW_MS,
} from './demo.constants';
import {
  DEMO_NOT_FOUND,
  hashClientIp,
  hashDemoToken,
  newDemoToken,
} from './demo-token';
import { seedDemoOrganisation } from './seed-demo-organisation';

export const DEMO_EXPIRED_REASON = 'Live demo expired';
// A demo tenant reads DELETED at once; one still holding its schema this long after gets
// its teardown published again, until the give-up age.
export const TEARDOWN_RETRY_AFTER_MS = 3 * 60_000;
export const TEARDOWN_GIVE_UP_MS = 30 * 60_000;
const NAME_ATTEMPTS = 5;

const COMPANIES = [
  'Acme',
  'Globex',
  'Initech',
  'Umbrella',
  'Hooli',
  'Wonka',
  'Soylent',
  'Stark',
  'Cyberdyne',
  'Tyrell',
  'Vandelay',
  'Monarch',
];
const KINDS = [
  'Labs',
  'Cloud',
  'Health',
  'Logistics',
  'Studio',
  'Robotics',
  'Foods',
  'Energy',
  'Media',
  'Systems',
  'Analytics',
  'Travel',
];

// "Globex Robotics" at globexrobotics: subdomains stay letters only, as the API requires.
export function demoCustomer(pick: (n: number) => number = randomInt) {
  const company = COMPANIES[pick(COMPANIES.length)];
  const kind = KINDS[pick(KINDS.length)];
  return {
    name: `${company} ${kind}`,
    subdomain: `${company}${kind}`.toLowerCase(),
  };
}

const DEMO_TENANT_SELECT = {
  id: true,
  name: true,
  subdomain: true,
  schemaName: true,
  status: true,
  planId: true,
  isTest: true,
  dbStatus: true,
  dnsStatus: true,
  credentialsStatus: true,
  billingStatus: true,
  notificationStatus: true,
  teardownDbStatus: true,
  teardownCredentialsStatus: true,
  teardownBillingStatus: true,
  stepModes: true,
  cancelReason: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  organisation: { select: { baseDomain: true, plans: true } },
  events: {
    orderBy: { timestamp: 'desc' },
    take: 100,
    select: {
      id: true,
      tenantId: true,
      eventType: true,
      status: true,
      payload: true,
      timestamp: true,
    },
  },
} satisfies Prisma.TenantSelect;

@Injectable()
export class DemoService implements OnModuleInit {
  private readonly logger = new Logger(DemoService.name);
  private readonly ipSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantsService,
    private readonly statusTokens: StatusTokenService,
    config: ConfigService,
  ) {
    this.ipSecret = config.getOrThrow<string>('JWT_SECRET');
  }

  // The seed creates it too; this keeps a fresh database's demo working without one.
  async onModuleInit(): Promise<void> {
    try {
      await seedDemoOrganisation(this.prisma);
    } catch (error) {
      this.logger.error(
        `Could not ensure the demo organisation: ${errorMessage(error)}`,
      );
    }
  }

  // A real test tenant in the demo organisation, through the real pipeline.
  async create(
    dto: CreateDemoTenantDto,
    clientIp: string | undefined,
  ): Promise<DemoTenantCreated> {
    const ipHash = hashClientIp(this.ipSecret, clientIp);
    await this.assertRoom(ipHash);

    const token = newDemoToken();
    const failStep: DemoFailStep | null = dto.failStep ?? null;
    const expiresAt = new Date(Date.now() + DEMO_LIFETIME_MS);
    const tenant = await this.createTenant({
      tokenHash: hashDemoToken(token),
      ipHash,
      failStep,
      expiresAt,
    });
    this.logger.log(
      `Demo tenant ${tenant.id} (${tenant.subdomain}) created${failStep ? `, ${failStep} set to fail` : ''}`,
    );
    return {
      token,
      liveUrl: `${this.statusTokens.frontendUrl}/demo/${token}`,
      statusUrl: tenant.statusUrl,
      name: tenant.name,
      failStep,
      expiresAt: expiresAt.toISOString(),
    };
  }

  // Test tenants skip the organisation quotas, so the demo has its own: per visitor, and
  // a cap on schemas alive at once.
  private async assertRoom(ipHash: string): Promise<void> {
    const since = new Date(Date.now() - DEMO_RATE_WINDOW_MS);
    const [recent, live] = await Promise.all([
      this.prisma.demoTenant.findMany({
        where: { ipHash, createdAt: { gte: since } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.tenant.count({
        where: { organisationId: DEMO_ORGANISATION_ID, live: true },
      }),
    ]);
    if (recent.length >= DEMO_MAX_PER_IP_PER_HOUR) {
      const freesAt =
        recent[recent.length - DEMO_MAX_PER_IP_PER_HOUR].createdAt.getTime() +
        DEMO_RATE_WINDOW_MS;
      const wait = Math.max(1, Math.ceil((freesAt - Date.now()) / 1000));
      throw new QuotaExceededException(
        `That's ${DEMO_MAX_PER_IP_PER_HOUR} live demos from you in the last hour. Try again in ${describeWait(wait)}, or sign up free and add your own test customers.`,
        wait,
      );
    }
    if (live >= DEMO_MAX_LIVE) {
      throw new QuotaExceededException(
        `The live demo is full right now (${DEMO_MAX_LIVE} running). Each one is removed after ${DEMO_LIFETIME_MS / 60_000} minutes, so try again shortly.`,
        DEMO_FULL_RETRY_AFTER_S,
      );
    }
  }

  private async createTenant(demo: Prisma.DemoTenantCreateWithoutTenantInput) {
    for (let attempt = 1; ; attempt++) {
      const { name, subdomain } = demoCustomer();
      try {
        return await this.tenants.create(
          { name, subdomain, planId: DEMO_PLAN_ID, test: true },
          { organisationId: DEMO_ORGANISATION_ID, ownerId: null },
          demo,
        );
      } catch (error) {
        // Another live demo has that name; draw again.
        if (!(error instanceof ConflictException) || attempt >= NAME_ATTEMPTS) {
          throw error;
        }
      }
    }
  }

  async view(token: string): Promise<DemoTenantView> {
    const row = await this.prisma.demoTenant.findUnique({
      where: { tokenHash: hashDemoToken(token) },
      include: { tenant: { select: DEMO_TENANT_SELECT } },
    });
    if (!row) {
      throw new NotFoundException(DEMO_NOT_FOUND);
    }
    const { organisation, events, ...tenant } = row.tenant;
    return {
      tenant: {
        ...tenant,
        address: tenantAddress(tenant.subdomain, organisation?.baseDomain),
        planName: planNameFor(
          effectivePlans(organisation?.plans),
          tenant.planId,
        ),
        stepModes: storedStepModes(tenant.stepModes),
        statusUrl: this.statusTokens.urlFor(tenant.id),
        createdAt: tenant.createdAt.toISOString(),
        updatedAt: tenant.updatedAt.toISOString(),
        deletedAt: tenant.deletedAt?.toISOString() ?? null,
      },
      events: events.map((event) => ({
        ...event,
        timestamp: event.timestamp.toISOString(),
      })),
      failStep: (row.failStep as DemoFailStep | null) ?? null,
      failInjected: row.failInjectedAt !== null,
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  // The same retry a company runs from its dashboard.
  async retry(token: string): Promise<DemoTenantView> {
    const row = await this.prisma.demoTenant.findUnique({
      where: { tokenHash: hashDemoToken(token) },
      select: { tenantId: true },
    });
    if (!row) {
      throw new NotFoundException(DEMO_NOT_FOUND);
    }
    await this.tenants.retry(row.tenantId, DEMO_ORGANISATION_ID);
    return this.view(token);
  }

  // Expired demos go through the deprovisioning saga like any removed customer, so their
  // schemas are dropped. `live` stays true until the schema is gone.
  @Cron(CronExpression.EVERY_MINUTE)
  async removeExpired(): Promise<number> {
    const now = Date.now();
    let removed = 0;
    try {
      const expired = await this.prisma.tenant.findMany({
        where: {
          organisationId: DEMO_ORGANISATION_ID,
          live: true,
          demo: { expiresAt: { lt: new Date(now) } },
          OR: [
            { status: { not: TenantStatus.DELETED } },
            {
              deletedAt: {
                lt: new Date(now - TEARDOWN_RETRY_AFTER_MS),
                gt: new Date(now - TEARDOWN_GIVE_UP_MS),
              },
            },
          ],
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
      for (const { id } of expired) {
        try {
          await this.tenants.delete(
            id,
            DEMO_ORGANISATION_ID,
            DEMO_EXPIRED_REASON,
          );
          removed++;
        } catch (error) {
          this.logger.error(
            `Could not remove expired demo tenant ${id}: ${errorMessage(error)}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Error removing expired demos: ${errorMessage(error)}`);
    }
    if (removed > 0) {
      this.logger.log(`Removed ${removed} expired demo tenant(s)`);
    }
    return removed;
  }
}
