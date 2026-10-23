import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AmqpConnection, RABBIT_HANDLER } from '@golevelup/nestjs-rabbitmq';
import { Prisma, StepStatus, TenantStatus } from '.prisma/tenant-client';

import { TenantsService } from './tenants.service';
import { PrismaService } from '../prisma.service';
import { WebhookService } from '../webhooks/webhook.service';
import { QuotaExceededException, QuotasService } from './quotas.service';
import { StatusTokenService } from '../status/status-token.service';
import { CustomStepsService } from './custom-steps.service';
import {
  DEAD_LETTER_QUEUE,
  type DeadLetterMessage,
  type ProvisioningStep,
} from './dead-letters';

type MockPrisma = {
  plan: { findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock };
  tenant: {
    create: jest.Mock<Promise<unknown>, [Prisma.TenantCreateArgs]>;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock<Promise<unknown>, [Prisma.TenantUpdateArgs]>;
    updateMany: jest.Mock<
      Promise<{ count: number }>,
      [Prisma.TenantUpdateManyArgs]
    >;
    delete: jest.Mock;
    count: jest.Mock;
  };
  eventLog: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock };
  organisation: { findUnique: jest.Mock };
  demoTenant: { updateMany: jest.Mock };
};

const buildPrisma = (): MockPrisma => ({
  plan: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
  tenant: {
    create: jest.fn<Promise<unknown>, [Prisma.TenantCreateArgs]>(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn<Promise<unknown>, [Prisma.TenantUpdateArgs]>(),
    updateMany: jest.fn<
      Promise<{ count: number }>,
      [Prisma.TenantUpdateManyArgs]
    >(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  eventLog: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  organisation: {
    findUnique: jest.fn().mockResolvedValue({
      handle: 'acme-corp',
      baseDomain: null,
      plans: null,
    }),
  },
  demoTenant: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
});

describe('TenantsService', () => {
  let service: TenantsService;
  let prisma: MockPrisma;
  let amqp: { publish: jest.Mock };
  let webhooks: { notify: jest.Mock };
  let quotas: { assertCanProvision: jest.Mock; record: jest.Mock };
  let customSteps: {
    open: jest.Mock;
    send: jest.Mock;
    latest: jest.Mock;
    close: jest.Mock;
    cancelOpen: jest.Mock;
    forTenant: jest.Mock;
    teardownsToRetry: jest.Mock;
  };
  const statusTokens = {
    hashFor: jest.fn((id: string) => `hash(${id})`),
    urlFor: jest.fn((id: string) => `https://app.test/status/tok(${id})`),
  };

  const baseDto = { name: 'Acme', subdomain: 'acme', planId: 'starter' };
  const creator = { organisationId: 'org-1', ownerId: 'owner-1' };
  // How every read is scoped: the company's customers, never its legacy workspace tenant.
  const inOrg = { organisationId: 'org-1', isWorkspace: false };
  // The only statuses a worker's step result may change.
  const live = [
    TenantStatus.PROVISIONING,
    TenantStatus.FAILED,
    TenantStatus.ACTIVE,
  ];

  beforeEach(async () => {
    prisma = buildPrisma();
    amqp = { publish: jest.fn().mockResolvedValue(undefined) };
    webhooks = { notify: jest.fn() };
    quotas = {
      assertCanProvision: jest.fn().mockResolvedValue({}),
      record: jest.fn().mockResolvedValue(undefined),
    };
    customSteps = {
      open: jest.fn(),
      send: jest.fn().mockResolvedValue({ delivered: true }),
      latest: jest.fn().mockResolvedValue(null),
      close: jest.fn().mockResolvedValue(true),
      cancelOpen: jest.fn().mockResolvedValue(0),
      forTenant: jest.fn().mockResolvedValue([]),
      teardownsToRetry: jest.fn().mockResolvedValue([]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AmqpConnection, useValue: amqp },
        { provide: WebhookService, useValue: webhooks },
        { provide: QuotasService, useValue: quotas },
        { provide: StatusTokenService, useValue: statusTokens },
        { provide: CustomStepsService, useValue: customSteps },
      ],
    }).compile();

    service = moduleRef.get(TenantsService);
  });

  describe('create', () => {
    it('reuses existing plan and sends tenant.requested to db-provisioner', async () => {
      prisma.plan.findUnique.mockResolvedValueOnce({ id: 'starter' });
      prisma.tenant.create.mockImplementationOnce(({ data }) =>
        Promise.resolve({
          id: 'tenant-1',
          subdomain: 'acme',
          planId: 'starter',
          schemaName: data.schemaName,
        }),
      );

      const result = await service.create(baseDto, creator);

      expect(prisma.plan.create).not.toHaveBeenCalled();
      expect(prisma.tenant.create).toHaveBeenCalledTimes(1);
      const [[createArgs]] = prisma.tenant.create.mock.calls;
      // The id is drawn up front so the status token hash lands in the same insert.
      expect(createArgs.data.id).toMatch(/^c[a-z0-9]{24}$/);
      expect(createArgs.data.statusTokenHash).toBe(
        `hash(${createArgs.data.id as string})`,
      );
      expect(result.statusUrl).toBe('https://app.test/status/tok(tenant-1)');
      expect(result.planName).toBe('Starter');
      expect(createArgs.data.dbStatus).toBe(StepStatus.IN_PROGRESS);
      expect(createArgs.data.organisationId).toBe('org-1');
      expect(createArgs.data.ownerId).toBe('owner-1');
      // The schema carries the organisation handle so two companies' "acme" never share one.
      expect(createArgs.data.schemaName).toBe('tenant_acme_corp_acme');
      // Straight to the worker's queue: tenant-service decides what runs next.
      expect(amqp.publish).toHaveBeenCalledWith(
        '',
        'db-provisioner-queue',
        {
          tenantId: 'tenant-1',
          subdomain: 'acme',
          planId: 'starter',
          schemaName: 'tenant_acme_corp_acme',
        },
        { timeout: 5_000 },
      );
      expect(prisma.tenant.updateMany).toHaveBeenCalledWith({
        where: { id: 'tenant-1' },
        data: { stepModes: { database: 'builtin' } },
      });
      expect(result.id).toBe('tenant-1');
      expect(result.address).toBe('acme.liftoff.ojusentinel.com');
      expect(quotas.assertCanProvision).toHaveBeenCalledWith('org-1');
      expect(quotas.record).toHaveBeenCalledWith('org-1', 'tenant-1');
    });

    it('provisions a test tenant outside the quotas, with billing told to skip', async () => {
      prisma.plan.findUnique.mockResolvedValueOnce({ id: 'starter' });
      prisma.tenant.create.mockImplementationOnce(({ data }) =>
        Promise.resolve({
          id: 'tenant-t',
          subdomain: 'acme',
          planId: 'starter',
          schemaName: data.schemaName,
          isTest: data.isTest,
        }),
      );

      const result = await service.create({ ...baseDto, test: true }, creator);

      const [[createArgs]] = prisma.tenant.create.mock.calls;
      expect(createArgs.data.isTest).toBe(true);
      expect(quotas.assertCanProvision).not.toHaveBeenCalled();
      expect(quotas.record).not.toHaveBeenCalled();
      expect(amqp.publish).toHaveBeenCalledWith(
        '',
        'db-provisioner-queue',
        expect.objectContaining({ tenantId: 'tenant-t', test: true }),
        { timeout: 5_000 },
      );
      expect(result.isTest).toBe(true);
    });

    describe('a live demo run', () => {
      const expiresAt = new Date('2026-10-23T12:15:00Z');
      const demoDto = { ...baseDto, planId: 'pro', test: true };
      const demoCreator = { organisationId: 'org-demo', ownerId: null };

      beforeEach(() => {
        prisma.plan.findUnique.mockResolvedValueOnce({ id: 'pro' });
        prisma.tenant.create.mockImplementationOnce(({ data }) =>
          Promise.resolve({
            id: 'tenant-d',
            subdomain: 'acme',
            planId: 'pro',
            schemaName: data.schemaName,
            isTest: data.isTest,
          }),
        );
      });

      it('writes the run in the same insert as the tenant', async () => {
        await service.create(demoDto, demoCreator, {
          failStep: null,
          expiresAt,
        });

        const [[createArgs]] = prisma.tenant.create.mock.calls;
        expect(createArgs.data.demo).toEqual({
          create: { failStep: null, expiresAt },
        });
      });

      it('dead-letters the chosen step once instead of sending it to the worker', async () => {
        prisma.demoTenant.updateMany.mockResolvedValueOnce({ count: 1 });

        await service.create(demoDto, demoCreator, {
          failStep: 'database',
          expiresAt,
        });

        expect(prisma.demoTenant.updateMany).toHaveBeenCalledWith({
          where: {
            tenantId: 'tenant-d',
            failStep: 'database',
            failInjectedAt: null,
          },
          data: { failInjectedAt: expect.any(Date) as unknown },
        });
        expect(amqp.publish).toHaveBeenCalledTimes(1);
        expect(amqp.publish).toHaveBeenCalledWith(
          'dlx.provisioning',
          'db-provisioner.failed',
          expect.objectContaining({ tenantId: 'tenant-d', test: true }),
          {
            timeout: 5_000,
            headers: { 'x-liftoff-demo-failure': 'db-provisioner-queue' },
          },
        );
      });

      it('sends the step to its worker once the failure is used up', async () => {
        await service.create(demoDto, demoCreator, {
          failStep: 'database',
          expiresAt,
        });

        expect(amqp.publish).toHaveBeenCalledWith(
          '',
          'db-provisioner-queue',
          expect.objectContaining({ tenantId: 'tenant-d' }),
          { timeout: 5_000 },
        );
      });
    });

    it('never looks for a demo failure on a real tenant', async () => {
      prisma.plan.findUnique.mockResolvedValueOnce({ id: 'starter' });
      prisma.tenant.create.mockResolvedValueOnce({
        id: 'tenant-1',
        subdomain: 'acme',
        planId: 'starter',
        schemaName: 'tenant_acme_corp_acme',
        isTest: false,
      });

      await service.create(baseDto, creator);

      const [[createArgs]] = prisma.tenant.create.mock.calls;
      expect(createArgs.data).not.toHaveProperty('demo');
      expect(prisma.demoTenant.updateMany).not.toHaveBeenCalled();
    });

    it('creates nothing when the organisation is over quota', async () => {
      quotas.assertCanProvision.mockRejectedValueOnce(
        new QuotaExceededException('over', 60),
      );

      await expect(service.create(baseDto, creator)).rejects.toBeInstanceOf(
        QuotaExceededException,
      );
      expect(prisma.tenant.create).not.toHaveBeenCalled();
      expect(amqp.publish).not.toHaveBeenCalled();
      expect(quotas.record).not.toHaveBeenCalled();
    });

    it("builds the address from the organisation's base domain", async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce({
        handle: 'acme-corp',
        baseDomain: 'acme.app',
      });
      prisma.plan.findUnique.mockResolvedValueOnce({ id: 'starter' });
      prisma.tenant.create.mockResolvedValueOnce({
        id: 'tenant-1',
        subdomain: 'globex',
        planId: 'starter',
        schemaName: 'tenant_acme_corp_globex',
      });

      const result = await service.create(
        { ...baseDto, subdomain: 'globex' },
        creator,
      );

      expect(result.address).toBe('globex.acme.app');
    });

    it('answers 404 when the caller’s organisation is gone', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce(null);

      await expect(service.create(baseDto, creator)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.tenant.create).not.toHaveBeenCalled();
    });

    it('fails the tenant at its first step when tenant.requested cannot be published', async () => {
      prisma.plan.findUnique.mockResolvedValueOnce({ id: 'starter' });
      prisma.tenant.create.mockResolvedValueOnce({
        id: 'tenant-1',
        subdomain: 'acme',
        planId: 'starter',
        schemaName: 'tenant_acme_corp_acme',
      });
      prisma.tenant.updateMany.mockResolvedValue({ count: 1 });
      amqp.publish.mockRejectedValueOnce(new Error('timeout'));

      await expect(service.create(baseDto, creator)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );

      const [{ data }] = prisma.tenant.updateMany.mock.calls.at(-1)!;
      expect(data).toEqual({
        status: TenantStatus.FAILED,
        dbStatus: StepStatus.FAILED,
      });
      expect(prisma.eventLog.create).toHaveBeenLastCalledWith({
        data: expect.objectContaining({
          eventType: 'tenant.provisioning.failed',
          payload: {
            step: 'dbStatus',
            error: 'Could not publish tenant.requested: timeout',
          },
        }) as unknown,
      });
    });

    it('records no owner when an API key, not a user, creates the tenant', async () => {
      prisma.plan.findUnique.mockResolvedValueOnce({ id: 'starter' });
      prisma.tenant.create.mockResolvedValueOnce({
        id: 'tenant-1',
        subdomain: 'acme',
        planId: 'starter',
      });

      await service.create(baseDto, { organisationId: 'org-1', ownerId: null });

      const [[createArgs]] = prisma.tenant.create.mock.calls;
      expect(createArgs.data).toMatchObject({
        organisationId: 'org-1',
        ownerId: null,
      });
    });

    it('creates plan on the fly when missing', async () => {
      prisma.plan.findUnique.mockResolvedValueOnce(null);
      prisma.plan.create.mockResolvedValueOnce({ id: 'starter' });
      prisma.tenant.create.mockResolvedValueOnce({
        id: 'tenant-2',
        subdomain: 'acme',
        planId: 'starter',
      });

      await service.create(baseDto, creator);

      expect(prisma.plan.create).toHaveBeenCalled();
    });

    it('translates the per-organisation unique violation into a 409 naming the field', async () => {
      prisma.plan.findUnique.mockResolvedValueOnce({ id: 'starter' });
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['organisationId', 'subdomain'] },
        },
      );
      prisma.tenant.create.mockRejectedValueOnce(p2002);

      await expect(service.create(baseDto, creator)).rejects.toThrow(
        new ConflictException(
          'A tenant with this subdomain already exists in your organisation.',
        ),
      );
      expect(amqp.publish).not.toHaveBeenCalled();
    });
  });

  describe('customer plans on create', () => {
    const custom = [
      { id: 'growth', name: 'Growth', description: 'For teams of 10 to 50' },
      { id: 'scale', name: 'Scale' },
    ];

    it('refuses a plan the company does not have with 400 naming its plans, before quotas or writes', async () => {
      await expect(
        service.create({ ...baseDto, planId: 'platinum' }, creator),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
        message:
          'Unknown customer plan "platinum". Your plans: starter, pro, enterprise.',
      });
      expect(quotas.assertCanProvision).not.toHaveBeenCalled();
      expect(prisma.tenant.create).not.toHaveBeenCalled();
      expect(amqp.publish).not.toHaveBeenCalled();
    });

    it('accepts a default plan by name, as older clients sent it', async () => {
      prisma.plan.findUnique.mockResolvedValueOnce({ id: 'pro' });
      prisma.tenant.create.mockResolvedValueOnce({
        id: 'tenant-1',
        subdomain: 'acme',
        planId: 'pro',
      });

      const result = await service.create(
        { ...baseDto, planId: 'Pro' },
        creator,
      );

      const [[createArgs]] = prisma.tenant.create.mock.calls;
      expect(createArgs.data.planId).toBe('pro');
      expect(result.planName).toBe('Pro');
    });

    it("validates against the company's own plans once it defined some, and labels the tenant with its name", async () => {
      prisma.organisation.findUnique.mockResolvedValue({
        handle: 'acme-corp',
        baseDomain: null,
        plans: custom,
      });
      prisma.plan.findUnique.mockResolvedValueOnce(null);
      prisma.plan.create.mockResolvedValueOnce({ id: 'growth' });
      prisma.tenant.create.mockResolvedValueOnce({
        id: 'tenant-1',
        subdomain: 'acme',
        planId: 'growth',
      });

      const result = await service.create(
        { ...baseDto, planId: 'growth' },
        creator,
      );

      expect(prisma.plan.create).toHaveBeenCalledWith({
        data: { id: 'growth', name: 'growth', maxUsers: 5, maxApiKeys: 3 },
      });
      expect(result.planName).toBe('Growth');
      await expect(service.create(baseDto, creator)).rejects.toThrow(
        'Unknown customer plan "starter". Your plans: growth, scale.',
      );
    });

    it("gives the Plan row a company-suffixed name when another company's plan took it", async () => {
      prisma.organisation.findUnique.mockResolvedValue({
        handle: 'acme-corp',
        baseDomain: null,
        plans: [{ id: 'team', name: 'Team' }],
      });
      prisma.plan.findUnique.mockResolvedValue(null);
      const taken = new Prisma.PrismaClientKnownRequestError('taken', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['name'] },
      });
      prisma.plan.create
        .mockRejectedValueOnce(taken)
        .mockResolvedValueOnce({ id: 'team' });
      prisma.tenant.create.mockResolvedValueOnce({
        id: 'tenant-1',
        subdomain: 'acme',
        planId: 'team',
      });

      await service.create({ ...baseDto, planId: 'team' }, creator);

      expect(prisma.plan.create).toHaveBeenLastCalledWith({
        data: {
          id: 'team',
          name: 'team (acme-corp)',
          maxUsers: 5,
          maxApiKeys: 3,
        },
      });
    });

    it('names a tenant by the plan the company calls it, falling back to the id for a removed plan', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce({
        baseDomain: 'acme.app',
        plans: [custom[0]],
      });
      prisma.tenant.findMany.mockResolvedValueOnce([
        { id: 't1', subdomain: 'a', planId: 'growth' },
        { id: 't2', subdomain: 'b', planId: 'scale' },
      ]);

      const result = await service.findAll('org-1');

      expect(result.map((t) => t.planName)).toEqual(['Growth', 'scale']);
      expect(result[0].address).toBe('a.acme.app');
    });
  });

  describe('saga handlers', () => {
    it('handleDbReady completes db on an in-flight tenant and starts dns only while dns is PENDING', async () => {
      prisma.tenant.updateMany.mockResolvedValue({ count: 1 });

      await service.handleDbReady({
        tenantId: 't',
        subdomain: 's',
        planId: 'p',
      });

      expect(prisma.tenant.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 't', status: { in: live } },
        data: { dbStatus: StepStatus.SUCCESS },
      });
      expect(prisma.tenant.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 't', dnsStatus: StepStatus.PENDING },
        data: { dnsStatus: StepStatus.IN_PROGRESS },
      });
      expect(prisma.eventLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'tenant.db.ready',
        }) as unknown,
      });
    });

    it('handleProvisioningComplete sets ACTIVE via the enum (not a string literal)', async () => {
      prisma.tenant.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.handleProvisioningComplete({
        tenantId: 't',
        subdomain: 's',
      });

      const [[updateCall]] = prisma.tenant.updateMany.mock.calls;
      expect(updateCall.where).toEqual({
        id: 't',
        status: { in: [TenantStatus.PROVISIONING, TenantStatus.FAILED] },
      });
      expect(updateCall.data.status).toBe(TenantStatus.ACTIVE);
      expect(updateCall.data.notificationStatus).toBe(StepStatus.SUCCESS);
    });

    it('never brings a cancelled or removed tenant back to ACTIVE', async () => {
      prisma.tenant.updateMany.mockResolvedValueOnce({ count: 0 });

      await service.handleProvisioningComplete({
        tenantId: 't',
        subdomain: 's',
      });

      expect(webhooks.notify).not.toHaveBeenCalled();
      expect(prisma.eventLog.create).not.toHaveBeenCalled();
    });

    it('records notification as SKIPPED when notification-service sent nothing', async () => {
      prisma.tenant.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.handleProvisioningComplete({
        tenantId: 't',
        subdomain: 's',
        notification: { sent: false, recipients: 0, skipReason: 'no-provider' },
      });

      const [[updateCall]] = prisma.tenant.updateMany.mock.calls;
      expect(updateCall.data.status).toBe(TenantStatus.ACTIVE);
      expect(updateCall.data.notificationStatus).toBe(StepStatus.SKIPPED);
      expect(webhooks.notify).toHaveBeenCalledWith('t', 'tenant.active');
    });

    it('records notification as SUCCESS when the company was emailed', async () => {
      prisma.tenant.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.handleProvisioningComplete({
        tenantId: 't',
        subdomain: 's',
        notification: { sent: true, recipients: 1 },
      });

      const [[updateCall]] = prisma.tenant.updateMany.mock.calls;
      expect(updateCall.data.notificationStatus).toBe(StepStatus.SUCCESS);
    });

    it('notifies the company webhook once the tenant is ACTIVE', async () => {
      prisma.tenant.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.handleProvisioningComplete({
        tenantId: 't',
        subdomain: 's',
      });

      expect(webhooks.notify).toHaveBeenCalledWith('t', 'tenant.active');
    });

    it('does not notify the webhook when activation fails', async () => {
      prisma.tenant.updateMany.mockRejectedValueOnce(new Error('gone'));

      await service.handleProvisioningComplete({
        tenantId: 't',
        subdomain: 's',
      });

      expect(webhooks.notify).not.toHaveBeenCalled();
    });
  });

  // A worker that was mid-step when the tenant was cancelled or removed still reports in
  // (seen on production: "<Customer> is ready" for a deleted tenant). Nothing may change.
  describe('late step results for a tenant that is no longer live', () => {
    const saga = { tenantId: 't', subdomain: 's', planId: 'starter' };
    let debug: jest.SpyInstance;

    beforeEach(() => {
      debug = jest
        .spyOn(Logger.prototype, 'debug')
        .mockImplementation(() => undefined);
      prisma.tenant.updateMany.mockResolvedValue({ count: 0 });
    });

    const late = {
      'tenant.db.ready': () => service.handleDbReady(saga),
      'tenant.dns.ready': () => service.handleDnsReady(saga),
      'tenant.credentials.ready': () => service.handleCredentialsReady(saga),
      'tenant.billing.active': () =>
        service.handleBillingActive({
          ...saga,
          stripeCustomerId: 'cus_late',
          stripeSubscriptionId: 'sub_late',
          subscriptionStatus: 'trialing',
          trialEnd: null,
        }),
    };

    it.each(Object.keys(late))(
      'ignores %s: no step change, no next step, no event, logged at debug',
      async (event) => {
        await late[event as keyof typeof late]();

        expect(prisma.tenant.updateMany).toHaveBeenCalledTimes(1);
        const [[call]] = prisma.tenant.updateMany.mock.calls;
        expect(call.where).toEqual({ id: 't', status: { in: live } });
        expect(prisma.tenant.update).not.toHaveBeenCalled();
        expect(prisma.eventLog.create).not.toHaveBeenCalled();
        expect(webhooks.notify).not.toHaveBeenCalled();
        expect(amqp.publish).not.toHaveBeenCalled();
        expect(debug).toHaveBeenCalledWith(
          expect.stringContaining(`${event} for tenant t ignored`),
        );
      },
    );
  });

  describe('out-of-order events', () => {
    type TenantRow = Record<ProvisioningStep | 'id' | 'status', string>;
    let row: TenantRow;

    const saga = { tenantId: 't', subdomain: 's', planId: 'starter' };
    const deliver = {
      dbReady: () => service.handleDbReady(saga),
      dnsReady: () => service.handleDnsReady(saga),
      credentialsReady: () => service.handleCredentialsReady(saga),
      billingActive: () =>
        service.handleBillingActive({
          ...saga,
          stripeCustomerId: 'cus_sim',
          stripeSubscriptionId: 'sub_sim',
          subscriptionStatus: 'trialing',
          trialEnd: null,
        }),
      complete: () =>
        service.handleProvisioningComplete({ tenantId: 't', subdomain: 's' }),
      billingFailed: () =>
        service.handleDeadLetter(saga, {
          fields: { routingKey: 'billing.failed' },
          properties: {},
        }),
    };

    const everyStepSucceeded = {
      status: TenantStatus.ACTIVE,
      dbStatus: StepStatus.SUCCESS,
      dnsStatus: StepStatus.SUCCESS,
      credentialsStatus: StepStatus.SUCCESS,
      billingStatus: StepStatus.SUCCESS,
      notificationStatus: StepStatus.SUCCESS,
    };

    // A where value is either the expected value or an { in: [...] } filter.
    const matches = (where: object) =>
      Object.entries(where).every(([field, condition]) =>
        ((condition as { in?: unknown[] }).in ?? [condition]).includes(
          row[field as keyof TenantRow],
        ),
      );

    beforeEach(() => {
      row = {
        id: 't',
        status: TenantStatus.PROVISIONING,
        dbStatus: StepStatus.IN_PROGRESS,
        dnsStatus: StepStatus.PENDING,
        credentialsStatus: StepStatus.PENDING,
        billingStatus: StepStatus.PENDING,
        notificationStatus: StepStatus.PENDING,
      };
      prisma.tenant.updateMany.mockImplementation(({ where = {}, data }) => {
        if (!matches(where)) {
          return Promise.resolve({ count: 0 });
        }
        Object.assign(row, data);
        return Promise.resolve({ count: 1 });
      });
    });

    it('stores the Stripe ids on the tenant when billing created a subscription', async () => {
      await service.handleBillingActive({
        ...saga,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        subscriptionStatus: 'trialing',
        trialEnd: null,
      });

      expect(prisma.tenant.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 't', status: { in: live } },
        data: {
          billingStatus: StepStatus.SUCCESS,
          stripeCustomerId: 'cus_1',
          stripeSubscriptionId: 'sub_1',
        },
      });
      expect(row).toMatchObject({
        billingStatus: StepStatus.SUCCESS,
        stripeCustomerId: 'cus_1',
        notificationStatus: StepStatus.IN_PROGRESS,
      });
      expect(prisma.eventLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'tenant.billing.active',
        }) as unknown,
      });
    });

    it('records billing as SKIPPED with no Stripe ids when the company has not connected Stripe', async () => {
      await service.handleBillingActive({
        ...saga,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionStatus: 'skipped',
        trialEnd: null,
        skipped: true,
        skipReason: 'not-connected',
      });

      expect(prisma.tenant.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 't', status: { in: live } },
        data: { billingStatus: StepStatus.SKIPPED },
      });
      expect(row).not.toHaveProperty('stripeCustomerId');
      expect(prisma.eventLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'tenant.billing.skipped',
          payload: expect.objectContaining({
            skipReason: 'not-connected',
          }) as unknown,
        }) as unknown,
      });
    });

    it('records billing as SKIPPED, not SUCCESS, and still starts notification for a test tenant', async () => {
      await service.handleBillingActive({
        ...saga,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionStatus: 'skipped',
        trialEnd: null,
        skipped: true,
        test: true,
      });

      expect(row.billingStatus).toBe(StepStatus.SKIPPED);
      expect(row.notificationStatus).toBe(StepStatus.IN_PROGRESS);
      expect(prisma.eventLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'tenant.billing.skipped',
        }) as unknown,
      });
    });

    it('keeps billing SUCCESS when billing.active is handled before credentials.ready', async () => {
      await deliver.dbReady();
      await deliver.dnsReady();
      // Simulated billing consumed credentials.ready and finished first.
      await deliver.billingActive();
      await deliver.complete();
      await deliver.credentialsReady();

      expect(row).toMatchObject(everyStepSucceeded);
    });

    it('keeps dns SUCCESS when dns.ready is handled before db.ready', async () => {
      await deliver.dnsReady();
      await deliver.dbReady();
      await deliver.credentialsReady();
      await deliver.billingActive();
      await deliver.complete();

      expect(row).toMatchObject(everyStepSucceeded);
    });

    it('ends with every step SUCCESS when the whole saga is handled in reverse', async () => {
      await deliver.complete();
      await deliver.billingActive();
      await deliver.credentialsReady();
      await deliver.dnsReady();
      await deliver.dbReady();

      expect(row).toMatchObject(everyStepSucceeded);
    });

    it('does not restart a step that dead-lettered before its start was recorded', async () => {
      await deliver.dbReady();
      await deliver.dnsReady();
      await deliver.billingFailed();
      await deliver.credentialsReady();

      expect(row).toMatchObject({
        status: TenantStatus.FAILED,
        credentialsStatus: StepStatus.SUCCESS,
        billingStatus: StepStatus.FAILED,
        notificationStatus: StepStatus.PENDING,
      });
    });

    it('lets a replayed step that failed succeed and finish the saga', async () => {
      await deliver.dbReady();
      await deliver.dnsReady();
      await deliver.credentialsReady();
      await deliver.billingFailed();
      // Replaying credentials.ready reaches tenant-service as well as billing.
      await deliver.credentialsReady();
      expect(row.billingStatus).toBe(StepStatus.FAILED);

      await deliver.billingActive();
      await deliver.complete();

      expect(row).toMatchObject(everyStepSucceeded);
    });

    it.each([
      TenantStatus.CANCELLED,
      TenantStatus.DEPROVISIONING,
      TenantStatus.DELETED,
    ])(
      'leaves a %s tenant exactly as it is when the workers report in late',
      async (status) => {
        await deliver.dbReady();
        // Cancelled or removed while dns ran: open steps are CANCELLED, nothing else moves.
        Object.assign(row, {
          status,
          dnsStatus: StepStatus.CANCELLED,
          credentialsStatus: StepStatus.CANCELLED,
          billingStatus: StepStatus.CANCELLED,
          notificationStatus: StepStatus.CANCELLED,
        });
        const before = { ...row };
        prisma.eventLog.create.mockClear();

        await deliver.dnsReady();
        await deliver.credentialsReady();
        await deliver.billingActive();
        await deliver.complete();
        await deliver.billingFailed();

        expect(row).toEqual(before);
        expect(prisma.eventLog.create).not.toHaveBeenCalled();
        expect(webhooks.notify).not.toHaveBeenCalled();
        expect(amqp.publish).not.toHaveBeenCalled();
      },
    );
  });

  describe('failStep', () => {
    it('fails the step and the tenant, then logs an Error event', async () => {
      prisma.tenant.updateMany.mockResolvedValueOnce({ count: 1 });

      await expect(
        service.failStep('t', 'billingStatus', 'billing-queue rejected', {
          deadLetterKey: 'billing.failed',
        }),
      ).resolves.toBe(true);

      expect(prisma.tenant.updateMany).toHaveBeenCalledWith({
        where: {
          id: 't',
          status: { in: [TenantStatus.PROVISIONING, TenantStatus.FAILED] },
        },
        data: {
          status: TenantStatus.FAILED,
          billingStatus: StepStatus.FAILED,
        },
      });
      expect(prisma.eventLog.create).toHaveBeenCalledWith({
        data: {
          tenantId: 't',
          eventType: 'tenant.provisioning.failed',
          status: 'Error',
          payload: {
            step: 'billingStatus',
            error: 'billing-queue rejected',
            deadLetterKey: 'billing.failed',
          },
        },
      });
      expect(webhooks.notify).toHaveBeenCalledWith('t', 'tenant.failed');
      expect(amqp.publish).toHaveBeenCalledWith(
        'provisioning.direct',
        'tenant.failed',
        {
          tenantId: 't',
          step: 'billingStatus',
          error: 'billing-queue rejected',
        },
        { timeout: 5_000 },
      );
    });

    it('still fails the step when tenant.failed cannot be published', async () => {
      prisma.tenant.updateMany.mockResolvedValueOnce({ count: 1 });
      amqp.publish.mockRejectedValueOnce(new Error('broker down'));

      await expect(service.failStep('t', 'dbStatus', 'x')).resolves.toBe(true);
      expect(webhooks.notify).toHaveBeenCalledWith('t', 'tenant.failed');
    });

    it('leaves a tenant that is gone, active or cancelled alone', async () => {
      prisma.tenant.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.failStep('t', 'dbStatus', 'x')).resolves.toBe(false);
      expect(prisma.eventLog.create).not.toHaveBeenCalled();
      expect(webhooks.notify).not.toHaveBeenCalled();
      expect(amqp.publish).not.toHaveBeenCalled();
    });
  });

  describe('dead letters', () => {
    const deadLetter = (
      routingKey: string,
      headers?: DeadLetterMessage['properties']['headers'],
    ): DeadLetterMessage => ({
      fields: { routingKey },
      properties: { headers },
    });

    const payload = { tenantId: 't', subdomain: 'acme', planId: 'pro' };

    it('consumes every worker failure key from dlx.provisioning on its own queue', () => {
      // SetMetadata stores method metadata on the function itself.
      const handler: unknown = Object.getOwnPropertyDescriptor(
        TenantsService.prototype,
        'handleDeadLetter',
      )?.value;
      const config: unknown = Reflect.getMetadata(
        RABBIT_HANDLER,
        handler as object,
      );

      expect(config).toMatchObject({
        type: 'subscribe',
        exchange: 'dlx.provisioning',
        queue: 'tenant-service-dead-letter-queue',
        queueOptions: { durable: true },
      });
      expect((config as { routingKey: string[] }).routingKey).toEqual(
        expect.arrayContaining([
          'db-provisioner.failed',
          'dns-provisioner.failed',
          'credentials.failed',
          'billing.failed',
          'notification.failed',
        ]),
      );
    });

    it('keeps a durable, capped copy of every dead letter in provisioning.dead-letters', () => {
      expect(DEAD_LETTER_QUEUE).toEqual({
        name: 'provisioning.dead-letters',
        exchange: 'dlx.provisioning',
        routingKey: [
          'db-provisioner.failed',
          'dns-provisioner.failed',
          'credentials.failed',
          'billing.failed',
          'notification.failed',
          'db-provisioner.deprovision.failed',
          'credentials.deprovision.failed',
          'billing.deprovision.failed',
        ],
        options: { durable: true, maxLength: 10_000 },
      });
      // A separate queue, so consuming one copy never empties the other.
      expect(DEAD_LETTER_QUEUE.name).not.toBe(
        'tenant-service-dead-letter-queue',
      );
    });

    it.each([
      ['db-provisioner.failed', 'dbStatus'],
      ['dns-provisioner.failed', 'dnsStatus'],
      ['credentials.failed', 'credentialsStatus'],
      ['billing.failed', 'billingStatus'],
      ['notification.failed', 'notificationStatus'],
    ])('marks the step for %s as FAILED', async (routingKey, step) => {
      prisma.tenant.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.handleDeadLetter(payload, deadLetter(routingKey));

      const [[{ data }]] = prisma.tenant.updateMany.mock.calls;
      expect(data).toEqual({
        status: TenantStatus.FAILED,
        [step]: StepStatus.FAILED,
      });
    });

    it('reports the rejecting queue and original routing key from x-death', async () => {
      prisma.tenant.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.handleDeadLetter(
        payload,
        deadLetter('db-provisioner.failed', {
          'x-death': [
            {
              queue: 'db-provisioner-queue',
              reason: 'rejected',
              'routing-keys': ['tenant.requested'],
            },
          ],
        }),
      );

      expect(prisma.eventLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'tenant.provisioning.failed',
          status: 'Error',
          payload: {
            step: 'dbStatus',
            error: 'db-provisioner-queue rejected tenant.requested',
            deadLetterKey: 'db-provisioner.failed',
          },
        }) as unknown,
      });
    });

    it('says when the live demo dead-lettered a step on purpose', async () => {
      prisma.tenant.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.handleDeadLetter(
        payload,
        deadLetter('billing.failed', {
          'x-liftoff-demo-failure': 'billing-queue',
        }),
      );

      expect(prisma.eventLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'tenant.provisioning.failed',
          payload: {
            step: 'billingStatus',
            error:
              'Live demo: sent to the dead-letter exchange as billing.failed instead of billing-queue, on purpose',
            deadLetterKey: 'billing.failed',
          },
        }) as unknown,
      });
    });

    it('ignores a dead letter without a tenantId or with an unknown key', async () => {
      await service.handleDeadLetter(
        { subdomain: 'acme' },
        deadLetter('billing.failed'),
      );
      await service.handleDeadLetter(payload, deadLetter('mystery.failed'));
      await service.handleDeadLetter(undefined, deadLetter('billing.failed'));

      expect(prisma.tenant.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('organisation scoping', () => {
    const customer = {
      id: 't',
      subdomain: 'acme',
      organisationId: 'org-1' as string | null,
      isWorkspace: false,
      status: TenantStatus.PROVISIONING,
      dbStatus: StepStatus.SUCCESS,
      dnsStatus: StepStatus.IN_PROGRESS,
      credentialsStatus: StepStatus.PENDING,
      billingStatus: StepStatus.PENDING,
      notificationStatus: StepStatus.PENDING,
      events: [{ id: 'e1', eventType: 'tenant.created' }],
    };
    let stored: typeof customer;

    const scoped = {
      findOne: (org: string) => service.findOne('t', org),
      findEvents: (org: string) => service.findEvents('t', org),
      cancel: (org: string) => service.cancel('t', org, 'changed mind'),
      delete: (org: string) => service.delete('t', org),
    };

    beforeEach(() => {
      stored = { ...customer };
      // Answers like Postgres would for this one row.
      prisma.tenant.findFirst.mockImplementation(
        ({ where }: Prisma.TenantFindFirstArgs) =>
          Promise.resolve(
            where?.id === stored.id &&
              where?.organisationId === stored.organisationId &&
              where?.isWorkspace === stored.isWorkspace
              ? stored
              : null,
          ),
      );
      prisma.tenant.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...stored, ...data }),
      );
      prisma.tenant.updateMany.mockResolvedValue({ count: 1 });
      prisma.tenant.findUnique.mockImplementation(() =>
        Promise.resolve(stored),
      );
      prisma.tenant.delete.mockResolvedValue(stored);
    });

    it.each(Object.entries(scoped))(
      '%s serves any user of the organisation',
      async (_name, call) => {
        await expect(call('org-1')).resolves.toBeTruthy();
        expect(prisma.tenant.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 't', ...inOrg } }),
        );
      },
    );

    it.each(Object.entries(scoped))(
      '%s returns 404 to another organisation and changes nothing',
      async (_name, call) => {
        await expect(call('org-2')).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.tenant.update).not.toHaveBeenCalled();
        expect(prisma.tenant.updateMany).not.toHaveBeenCalled();
        expect(prisma.tenant.delete).not.toHaveBeenCalled();
        expect(amqp.publish).not.toHaveBeenCalled();
      },
    );

    it.each(Object.entries(scoped))(
      '%s hides a tenant without an organisation from everyone',
      async (_name, call) => {
        stored.organisationId = null;

        await expect(call('org-1')).rejects.toBeInstanceOf(NotFoundException);
      },
    );

    it.each(Object.entries(scoped))(
      "%s hides the company's own legacy workspace tenant",
      async (_name, call) => {
        stored.isWorkspace = true;

        await expect(call('org-1')).rejects.toBeInstanceOf(NotFoundException);
      },
    );

    it('findEvents returns the tenant’s events', async () => {
      await expect(service.findEvents('t', 'org-1')).resolves.toEqual(
        customer.events,
      );
    });

    it("lists only the organisation's customer tenants, without the removed ones", async () => {
      prisma.tenant.findMany.mockResolvedValueOnce([]);

      await service.findAll('org-1');

      expect(prisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ...inOrg, status: { not: TenantStatus.DELETED } },
        }),
      );
    });

    it("limits the cross-tenant event log to the organisation's customers", async () => {
      prisma.eventLog.findMany.mockResolvedValueOnce([]);

      await service.findAllEvents('org-1');

      expect(prisma.eventLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenant: inOrg } }),
      );
    });
  });

  describe('cancel', () => {
    const provisioningTenant = {
      id: 't',
      subdomain: 'acme',
      organisationId: 'org-1',
      isWorkspace: false,
      status: TenantStatus.PROVISIONING,
      dbStatus: StepStatus.SUCCESS,
      dnsStatus: StepStatus.IN_PROGRESS,
      credentialsStatus: StepStatus.PENDING,
      billingStatus: StepStatus.PENDING,
      notificationStatus: StepStatus.PENDING,
    };

    beforeEach(() => {
      prisma.tenant.findUnique.mockResolvedValue({ id: 't' });
    });

    it('cancels in-progress + pending steps and publishes tenant.cancelled', async () => {
      prisma.tenant.findFirst.mockResolvedValueOnce(provisioningTenant);
      prisma.tenant.update.mockResolvedValueOnce({
        ...provisioningTenant,
        status: TenantStatus.CANCELLED,
      });

      await service.cancel('t', 'org-1', 'user changed mind');

      const [[{ data: update }]] = prisma.tenant.update.mock.calls;
      expect(update.status).toBe(TenantStatus.CANCELLED);
      // Already-SUCCESS steps are left alone, others go CANCELLED.
      expect(update).not.toHaveProperty('dbStatus');
      expect(update.dnsStatus).toBe(StepStatus.CANCELLED);
      expect(update.credentialsStatus).toBe(StepStatus.CANCELLED);
      expect(update.billingStatus).toBe(StepStatus.CANCELLED);
      expect(update.notificationStatus).toBe(StepStatus.CANCELLED);
      expect(amqp.publish).toHaveBeenCalledWith(
        'provisioning.direct',
        'tenant.cancelled',
        expect.objectContaining({ tenantId: 't', reason: 'user changed mind' }),
      );
    });

    it('defaults the reason when the user gives none', async () => {
      prisma.tenant.findFirst.mockResolvedValueOnce(provisioningTenant);
      prisma.tenant.update.mockResolvedValueOnce({});

      await service.cancel('t', 'org-1');

      const [[{ data: update }]] = prisma.tenant.update.mock.calls;
      expect(update.cancelReason).toBe('Cancelled by user');
    });

    it.each([
      TenantStatus.CANCELLED,
      TenantStatus.DEPROVISIONING,
      TenantStatus.DELETED,
    ])('throws BadRequestException for a %s tenant', async (status) => {
      prisma.tenant.findFirst.mockResolvedValueOnce({
        ...provisioningTenant,
        status,
      });

      await expect(service.cancel('t', 'org-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.tenant.update).not.toHaveBeenCalled();
      expect(prisma.tenant.updateMany).not.toHaveBeenCalled();
      expect(amqp.publish).not.toHaveBeenCalled();
    });

    it.each([TenantStatus.ACTIVE, TenantStatus.FAILED])(
      'deprovisions a %s tenant and records the reason',
      async (status) => {
        prisma.tenant.findFirst.mockResolvedValueOnce({
          ...provisioningTenant,
          status,
          schemaName: 'tenant_acme_corp_acme',
          stripeSubscriptionId: 'sub_1',
          isTest: false,
        });
        prisma.tenant.updateMany.mockResolvedValueOnce({ count: 1 });

        await service.cancel('t', 'org-1', 'customer churned');

        const [[{ where, data }]] = prisma.tenant.updateMany.mock.calls;
        expect(where).toEqual({ id: 't', status });
        expect(data).toMatchObject({
          status: TenantStatus.DEPROVISIONING,
          cancelReason: 'customer churned',
          teardownBillingStatus: StepStatus.IN_PROGRESS,
        });
        expect(data.cancelledAt).toBeInstanceOf(Date);
        expect(amqp.publish).toHaveBeenCalledWith(
          'provisioning.direct',
          'tenant.deprovision',
          expect.objectContaining({
            tenantId: 't',
            reason: 'customer churned',
            stripeSubscriptionId: 'sub_1',
          }),
          { timeout: 5_000 },
        );
      },
    );

    it('lets the timeout sweeper cancel any tenant, in an organisation or not', async () => {
      prisma.tenant.findUnique.mockResolvedValueOnce({
        ...provisioningTenant,
        organisationId: null,
      });
      prisma.tenant.update.mockResolvedValueOnce({});

      await service.cancelStale('t', 'Provisioning timeout');

      expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { id: 't' },
      });
      const [[{ data: update }]] = prisma.tenant.update.mock.calls;
      expect(update.status).toBe(TenantStatus.CANCELLED);
      expect(update.cancelReason).toBe('Provisioning timeout');
    });

    it('cancelStale throws NotFoundException when the tenant is gone', async () => {
      prisma.tenant.findUnique.mockResolvedValueOnce(null);

      await expect(service.cancelStale('missing', 'x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('deprovisioning', () => {
    const active = {
      id: 't',
      name: 'Acme',
      subdomain: 'acme',
      organisationId: 'org-1',
      isWorkspace: false,
      isTest: false,
      status: TenantStatus.ACTIVE,
      schemaName: 'tenant_acme_corp_acme',
      stripeSubscriptionId: 'sub_1' as string | null,
      dbStatus: StepStatus.SUCCESS,
      dnsStatus: StepStatus.SUCCESS,
      credentialsStatus: StepStatus.SUCCESS,
      billingStatus: StepStatus.SUCCESS,
      notificationStatus: StepStatus.SUCCESS,
      teardownDbStatus: null as StepStatus | null,
      teardownCredentialsStatus: null as StepStatus | null,
      teardownBillingStatus: null as StepStatus | null,
    };

    beforeEach(() => {
      prisma.tenant.updateMany.mockResolvedValue({ count: 1 });
      prisma.tenant.findUnique.mockResolvedValue({ ...active });
    });

    it('publishes tenant.deprovision and leaves the tenant DEPROVISIONING; nothing is hard-deleted', async () => {
      prisma.tenant.findFirst.mockResolvedValueOnce({ ...active });

      await service.delete('t', 'org-1');

      const [[{ where, data }]] = prisma.tenant.updateMany.mock.calls;
      expect(where).toEqual({ id: 't', status: TenantStatus.ACTIVE });
      expect(data).toEqual({
        status: TenantStatus.DEPROVISIONING,
        teardownDbStatus: StepStatus.IN_PROGRESS,
        teardownCredentialsStatus: StepStatus.IN_PROGRESS,
        teardownBillingStatus: StepStatus.IN_PROGRESS,
      });
      expect(amqp.publish).toHaveBeenCalledWith(
        'provisioning.direct',
        'tenant.deprovision',
        {
          tenantId: 't',
          subdomain: 'acme',
          schemaName: 'tenant_acme_corp_acme',
          stripeSubscriptionId: 'sub_1',
          reason: 'Deleted by user',
        },
        { timeout: 5_000 },
      );
      expect(prisma.tenant.delete).not.toHaveBeenCalled();
      expect(webhooks.notify).not.toHaveBeenCalled();
    });

    it('skips billing teardown up front when there is no subscription', async () => {
      prisma.tenant.findFirst.mockResolvedValueOnce({
        ...active,
        stripeSubscriptionId: null,
      });

      await service.delete('t', 'org-1');

      const [[{ data }]] = prisma.tenant.updateMany.mock.calls;
      expect(data.teardownBillingStatus).toBe(StepStatus.SKIPPED);
    });

    it('stops a tenant that is still provisioning before tearing it down', async () => {
      prisma.tenant.findFirst.mockResolvedValueOnce({
        ...active,
        status: TenantStatus.PROVISIONING,
        dnsStatus: StepStatus.IN_PROGRESS,
        credentialsStatus: StepStatus.PENDING,
        billingStatus: StepStatus.PENDING,
        notificationStatus: StepStatus.PENDING,
        stripeSubscriptionId: null,
      });

      await service.delete('t', 'org-1');

      const [[{ data }]] = prisma.tenant.updateMany.mock.calls;
      expect(data).toMatchObject({
        status: TenantStatus.DEPROVISIONING,
        dnsStatus: StepStatus.CANCELLED,
        credentialsStatus: StepStatus.CANCELLED,
        notificationStatus: StepStatus.CANCELLED,
      });
      expect(data).not.toHaveProperty('dbStatus');
    });

    it('removes a test tenant at once: DELETED, the webhook, and teardown in the background', async () => {
      prisma.tenant.findFirst.mockResolvedValueOnce({
        ...active,
        isTest: true,
        stripeSubscriptionId: null,
      });

      await service.delete('t', 'org-1');

      const [[{ data }]] = prisma.tenant.updateMany.mock.calls;
      expect(data).toMatchObject({
        status: TenantStatus.DELETED,
        teardownBillingStatus: StepStatus.SKIPPED,
      });
      expect(data.deletedAt).toBeInstanceOf(Date);
      // The name is only given back once the schema is dropped.
      expect(data).not.toHaveProperty('live');
      expect(webhooks.notify).toHaveBeenCalledWith('t', 'tenant.deleted');
      expect(amqp.publish).toHaveBeenCalledWith(
        'provisioning.direct',
        'tenant.deprovision',
        expect.objectContaining({ test: true, stripeSubscriptionId: null }),
        { timeout: 5_000 },
      );
    });

    it('never drops a schema another tenant still uses', async () => {
      prisma.tenant.findFirst.mockResolvedValueOnce({ ...active });
      prisma.tenant.count.mockResolvedValueOnce(1);

      await service.delete('t', 'org-1');

      expect(prisma.tenant.count).toHaveBeenCalledWith({
        where: {
          id: { not: 't' },
          schemaName: 'tenant_acme_corp_acme',
          status: { not: TenantStatus.DELETED },
        },
      });
      expect(amqp.publish).toHaveBeenCalledWith(
        'provisioning.direct',
        'tenant.deprovision',
        expect.objectContaining({ schemaName: null }),
        { timeout: 5_000 },
      );
    });

    it('drops the legacy tenant_<subdomain> schema for a row from before schema names', async () => {
      prisma.tenant.findFirst.mockResolvedValueOnce({
        ...active,
        schemaName: null,
      });

      await service.delete('t', 'org-1');

      expect(amqp.publish).toHaveBeenCalledWith(
        'provisioning.direct',
        'tenant.deprovision',
        expect.objectContaining({ schemaName: 'tenant_acme' }),
        { timeout: 5_000 },
      );
    });

    it('is a no-op on a tenant that is already DELETED', async () => {
      prisma.tenant.findFirst.mockResolvedValueOnce({
        ...active,
        status: TenantStatus.DELETED,
        teardownDbStatus: StepStatus.SUCCESS,
        teardownCredentialsStatus: StepStatus.SUCCESS,
        teardownBillingStatus: StepStatus.SKIPPED,
      });

      await service.delete('t', 'org-1');

      expect(prisma.tenant.updateMany).not.toHaveBeenCalled();
      expect(amqp.publish).not.toHaveBeenCalled();
    });

    it('resumes a teardown that failed: the failed part goes back to IN_PROGRESS and is republished', async () => {
      prisma.tenant.findFirst.mockResolvedValueOnce({
        ...active,
        status: TenantStatus.DEPROVISIONING,
        teardownDbStatus: StepStatus.SUCCESS,
        teardownCredentialsStatus: StepStatus.SUCCESS,
        teardownBillingStatus: StepStatus.FAILED,
      });

      await service.delete('t', 'org-1');

      const [[{ where, data }]] = prisma.tenant.updateMany.mock.calls;
      expect(where).toEqual({ id: 't', status: TenantStatus.DEPROVISIONING });
      expect(data).toEqual({
        teardownBillingStatus: StepStatus.IN_PROGRESS,
        updatedAt: expect.any(Date) as Date,
      });
      expect(amqp.publish).toHaveBeenCalledWith(
        'provisioning.direct',
        'tenant.deprovision',
        expect.anything(),
        { timeout: 5_000 },
      );
      expect(prisma.eventLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'tenant.deprovision.retried',
        }) as unknown,
      });
    });

    it('sends a teardown again when a part is IN_PROGRESS but never reported', async () => {
      prisma.tenant.findFirst.mockResolvedValueOnce({
        ...active,
        status: TenantStatus.DEPROVISIONING,
        teardownDbStatus: StepStatus.IN_PROGRESS,
        teardownCredentialsStatus: StepStatus.SUCCESS,
        teardownBillingStatus: StepStatus.SKIPPED,
      });

      await service.delete('t', 'org-1');

      // Something to set, so the claim reaches the database instead of reporting 0 rows.
      const [[{ data }]] = prisma.tenant.updateMany.mock.calls;
      expect(data).toEqual({ updatedAt: expect.any(Date) as Date });
      expect(amqp.publish).toHaveBeenCalledWith(
        'provisioning.direct',
        'tenant.deprovision',
        expect.anything(),
        { timeout: 5_000 },
      );
    });

    it('starts one teardown when two DELETEs race', async () => {
      prisma.tenant.findFirst.mockResolvedValueOnce({ ...active });
      prisma.tenant.updateMany.mockResolvedValueOnce({ count: 0 });

      await service.delete('t', 'org-1');

      expect(amqp.publish).not.toHaveBeenCalled();
    });

    it('answers 503 when tenant.deprovision cannot be published, leaving it resumable', async () => {
      prisma.tenant.findFirst.mockResolvedValueOnce({ ...active });
      amqp.publish.mockRejectedValueOnce(new Error('broker down'));

      await expect(service.delete('t', 'org-1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    describe('results', () => {
      it('records each part and moves the tenant to DELETED once, when the last one lands', async () => {
        type Row = Record<string, unknown>;
        const row: Row = {
          id: 't',
          status: TenantStatus.DEPROVISIONING,
          live: true,
          teardownDbStatus: StepStatus.IN_PROGRESS,
          teardownCredentialsStatus: StepStatus.IN_PROGRESS,
          teardownBillingStatus: StepStatus.SKIPPED,
        };
        // No custom steps here, so no teardown request can hold the removal up.
        const matches = (where: Row) =>
          Object.entries(where).every(([field, cond]) => {
            if (field === 'customStepCalls') {
              return true;
            }
            const c = cond as { in?: unknown[] };
            return (
              c && typeof c === 'object' && 'in' in c ? c.in! : [cond]
            ).includes(row[field]);
          });
        prisma.tenant.updateMany.mockImplementation(
          ({ where = {}, data }: Prisma.TenantUpdateManyArgs) => {
            if (!matches(where as Row)) {
              return Promise.resolve({ count: 0 });
            }
            Object.assign(row, data);
            return Promise.resolve({ count: 1 });
          },
        );

        await service.handleDeprovisionDone({
          tenantId: 't',
          part: 'db',
          skipped: false,
        });
        expect(row.status).toBe(TenantStatus.DEPROVISIONING);
        expect(webhooks.notify).not.toHaveBeenCalled();

        await service.handleDeprovisionDone({
          tenantId: 't',
          part: 'credentials',
          skipped: true,
        });
        expect(row).toMatchObject({
          status: TenantStatus.DELETED,
          live: null,
          teardownDbStatus: StepStatus.SUCCESS,
          teardownCredentialsStatus: StepStatus.SKIPPED,
        });
        expect(row.deletedAt).toBeInstanceOf(Date);
        expect(webhooks.notify).toHaveBeenCalledWith('t', 'tenant.deleted');

        // A replayed result changes nothing and sends no second webhook.
        await service.handleDeprovisionDone({
          tenantId: 't',
          part: 'credentials',
          skipped: true,
        });
        expect(webhooks.notify).toHaveBeenCalledTimes(1);
      });

      it('gives a test tenant its name back once its schema is dropped', async () => {
        prisma.tenant.updateMany
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 })
          .mockResolvedValueOnce({ count: 1 });

        await service.handleDeprovisionDone({
          tenantId: 't',
          part: 'db',
          skipped: false,
        });

        expect(prisma.tenant.updateMany).toHaveBeenLastCalledWith({
          where: {
            id: 't',
            status: TenantStatus.DELETED,
            live: true,
            teardownDbStatus: { in: [StepStatus.SUCCESS, StepStatus.SKIPPED] },
          },
          data: { live: null },
        });
      });

      it('logs a Warning when something was left in place', async () => {
        await service.handleDeprovisionDone({
          tenantId: 't',
          part: 'billing',
          skipped: true,
          warning: 'Stripe is no longer connected: sub_1 was left in place',
        });

        expect(prisma.eventLog.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            eventType: 'tenant.billing.cancelled.warning',
            status: 'Warning',
          }) as unknown,
        });
      });

      it('ignores a result for a tenant that is not being removed', async () => {
        prisma.tenant.updateMany.mockResolvedValueOnce({ count: 0 });

        await service.handleDeprovisionDone({
          tenantId: 't',
          part: 'db',
          skipped: false,
        });

        expect(prisma.tenant.updateMany).toHaveBeenCalledTimes(1);
        expect(prisma.eventLog.create).not.toHaveBeenCalled();
      });

      it.each([
        ['db-provisioner.deprovision.failed', 'teardownDbStatus'],
        ['credentials.deprovision.failed', 'teardownCredentialsStatus'],
        ['billing.deprovision.failed', 'teardownBillingStatus'],
      ])(
        'marks the teardown FAILED for dead letter %s, leaving the tenant DEPROVISIONING',
        async (routingKey, column) => {
          await service.handleDeadLetter(
            { tenantId: 't' },
            { fields: { routingKey }, properties: {} },
          );

          const [[{ where, data }]] = prisma.tenant.updateMany.mock.calls;
          expect(where).toEqual({
            id: 't',
            status: {
              in: [TenantStatus.DEPROVISIONING, TenantStatus.DELETED],
            },
          });
          expect(data).toEqual({ [column]: StepStatus.FAILED });
          expect(webhooks.notify).not.toHaveBeenCalled();
          expect(prisma.eventLog.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
              eventType: 'tenant.deprovision.failed',
              status: 'Error',
            }) as unknown,
          });
        },
      );
    });
  });

  describe('retry', () => {
    const failedAt = (step: ProvisioningStep, extra: object = {}) => {
      const tenant: Record<string, unknown> = {
        id: 't',
        subdomain: 'acme',
        planId: 'pro',
        organisationId: 'org-1',
        isWorkspace: false,
        isTest: false,
        schemaName: 'tenant_acme_corp_acme',
        status: TenantStatus.FAILED,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        dbStatus: StepStatus.SUCCESS,
        dnsStatus: StepStatus.SUCCESS,
        credentialsStatus: StepStatus.SUCCESS,
        billingStatus: StepStatus.SUCCESS,
        notificationStatus: StepStatus.SUCCESS,
        ...extra,
      };
      const order: ProvisioningStep[] = [
        'dbStatus',
        'dnsStatus',
        'credentialsStatus',
        'billingStatus',
        'notificationStatus',
      ];
      for (const later of order.slice(order.indexOf(step) + 1)) {
        tenant[later] = StepStatus.PENDING;
      }
      tenant[step] = StepStatus.FAILED;
      return tenant;
    };

    beforeEach(() => {
      prisma.tenant.updateMany.mockResolvedValue({ count: 1 });
      prisma.tenant.findUnique.mockResolvedValue({
        id: 't',
        subdomain: 'acme',
      });
    });

    it.each([
      ['dnsStatus', 'dns-provisioner-queue', ['tenant.db.ready']],
      ['credentialsStatus', 'credentials-queue', ['tenant.dns.ready']],
      ['billingStatus', 'billing-queue', ['tenant.credentials.ready']],
      [
        'notificationStatus',
        'notification-queue',
        ['tenant.billing.active', 'tenant.billing.skipped'],
      ],
    ])(
      'republishes the stored input of %s straight to %s',
      async (step, queue, events) => {
        const stored = {
          tenantId: 't',
          subdomain: 'acme',
          planId: 'pro',
          x: 1,
        };
        prisma.tenant.findFirst.mockResolvedValueOnce(
          failedAt(step as ProvisioningStep),
        );
        prisma.eventLog.findFirst.mockResolvedValueOnce({ payload: stored });

        await service.retry('t', 'org-1');

        expect(prisma.eventLog.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              tenantId: 't',
              eventType: { in: events },
              status: 'Success',
            },
          }),
        );
        const [[{ where, data }]] = prisma.tenant.updateMany.mock.calls;
        expect(where).toEqual({
          id: 't',
          status: TenantStatus.FAILED,
          [step]: StepStatus.FAILED,
        });
        expect(data).toEqual({
          status: TenantStatus.PROVISIONING,
          [step]: StepStatus.IN_PROGRESS,
        });
        expect(amqp.publish).toHaveBeenCalledWith('', queue, stored, {
          timeout: 5_000,
        });
        expect(prisma.eventLog.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            eventType: 'tenant.retry',
            payload: expect.objectContaining({
              step,
              source: 'event-log',
            }) as unknown,
          }) as unknown,
        });
      },
    );

    it('rebuilds tenant.requested for the first step, which is never logged', async () => {
      prisma.tenant.findFirst.mockResolvedValueOnce(
        failedAt('dbStatus', { isTest: true }),
      );

      await service.retry('t', 'org-1');

      expect(prisma.eventLog.findFirst).not.toHaveBeenCalled();
      expect(amqp.publish).toHaveBeenCalledWith(
        '',
        'db-provisioner-queue',
        {
          tenantId: 't',
          subdomain: 'acme',
          planId: 'pro',
          test: true,
          schemaName: 'tenant_acme_corp_acme',
        },
        { timeout: 5_000 },
      );
    });

    it("rebuilds notification's input from the row when the log has nothing usable", async () => {
      prisma.tenant.findFirst.mockResolvedValueOnce(
        failedAt('notificationStatus', {
          billingStatus: StepStatus.SKIPPED,
        }),
      );
      prisma.eventLog.findFirst.mockResolvedValueOnce({
        payload: { tenantId: 'someone-else' },
      });

      await service.retry('t', 'org-1');

      expect(amqp.publish).toHaveBeenCalledWith(
        '',
        'notification-queue',
        expect.objectContaining({
          tenantId: 't',
          skipped: true,
          skipReason: 'not-connected',
          stripeSubscriptionId: null,
        }),
        { timeout: 5_000 },
      );
    });

    it.each([
      TenantStatus.ACTIVE,
      TenantStatus.PROVISIONING,
      TenantStatus.CANCELLED,
      TenantStatus.DEPROVISIONING,
    ])('refuses a %s tenant with 400 and publishes nothing', async (status) => {
      prisma.tenant.findFirst.mockResolvedValueOnce({
        ...failedAt('billingStatus'),
        status,
      });

      await expect(service.retry('t', 'org-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.tenant.updateMany).not.toHaveBeenCalled();
      expect(amqp.publish).not.toHaveBeenCalled();
    });

    it('answers 409 and publishes nothing when a second retry got there first', async () => {
      prisma.tenant.findFirst.mockResolvedValueOnce(failedAt('billingStatus'));
      prisma.tenant.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.retry('t', 'org-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(amqp.publish).not.toHaveBeenCalled();
    });

    it('puts the tenant back to FAILED and answers 503 when the retry cannot be published', async () => {
      prisma.tenant.findFirst.mockResolvedValueOnce(failedAt('billingStatus'));
      amqp.publish.mockRejectedValueOnce(new Error('broker down'));

      await expect(service.retry('t', 'org-1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      const [{ data }] = prisma.tenant.updateMany.mock.calls.at(-1)!;
      expect(data).toEqual({
        status: TenantStatus.FAILED,
        billingStatus: StepStatus.FAILED,
      });
    });

    it("answers 404 for another organisation's tenant", async () => {
      prisma.tenant.findFirst.mockResolvedValueOnce(null);

      await expect(service.retry('t', 'org-2')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(amqp.publish).not.toHaveBeenCalled();
    });
  });
});
