import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AmqpConnection, RABBIT_HANDLER } from '@golevelup/nestjs-rabbitmq';
import { Prisma, StepStatus, TenantStatus } from '.prisma/tenant-client';

import { TenantsService } from './tenants.service';
import { PrismaService } from '../prisma.service';
import { WebhookService } from '../webhooks/webhook.service';
import {
  DEAD_LETTER_QUEUE,
  type DeadLetterMessage,
  type ProvisioningStep,
} from './dead-letters';

type MockPrisma = {
  plan: { findFirst: jest.Mock; create: jest.Mock };
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
  };
  eventLog: { create: jest.Mock; findMany: jest.Mock };
};

const buildPrisma = (): MockPrisma => ({
  plan: { findFirst: jest.fn(), create: jest.fn() },
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
  },
  eventLog: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn() },
});

describe('TenantsService', () => {
  let service: TenantsService;
  let prisma: MockPrisma;
  let amqp: { publish: jest.Mock };
  let webhooks: { notify: jest.Mock };

  const baseDto = { name: 'Acme', subdomain: 'acme', planId: 'starter' };
  const creator = { organisationId: 'org-1', ownerId: 'owner-1' };
  // How every read is scoped: the company's customers, never its legacy workspace tenant.
  const inOrg = { organisationId: 'org-1', isWorkspace: false };

  beforeEach(async () => {
    prisma = buildPrisma();
    amqp = { publish: jest.fn().mockResolvedValue(undefined) };
    webhooks = { notify: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AmqpConnection, useValue: amqp },
        { provide: WebhookService, useValue: webhooks },
      ],
    }).compile();

    service = moduleRef.get(TenantsService);
  });

  describe('create', () => {
    it('reuses existing plan and publishes tenant.requested', async () => {
      prisma.plan.findFirst.mockResolvedValueOnce({ id: 'starter' });
      prisma.tenant.create.mockResolvedValueOnce({
        id: 'tenant-1',
        subdomain: 'acme',
        planId: 'starter',
      });

      const result = await service.create(baseDto, creator);

      expect(prisma.plan.create).not.toHaveBeenCalled();
      expect(prisma.tenant.create).toHaveBeenCalledTimes(1);
      const [[createArgs]] = prisma.tenant.create.mock.calls;
      expect(createArgs.data.dbStatus).toBe(StepStatus.IN_PROGRESS);
      expect(createArgs.data.organisationId).toBe('org-1');
      expect(createArgs.data.ownerId).toBe('owner-1');
      expect(amqp.publish).toHaveBeenCalledWith(
        'provisioning.direct',
        'tenant.requested',
        {
          tenantId: 'tenant-1',
          subdomain: 'acme',
          planId: 'starter',
        },
        { timeout: 5_000 },
      );
      expect(result.id).toBe('tenant-1');
    });

    it('fails the tenant at its first step when tenant.requested cannot be published', async () => {
      prisma.plan.findFirst.mockResolvedValueOnce({ id: 'starter' });
      prisma.tenant.create.mockResolvedValueOnce({
        id: 'tenant-1',
        subdomain: 'acme',
        planId: 'starter',
      });
      prisma.tenant.updateMany.mockResolvedValueOnce({ count: 1 });
      amqp.publish.mockRejectedValueOnce(new Error('timeout'));

      await expect(service.create(baseDto, creator)).rejects.toThrow('timeout');

      const [[{ data }]] = prisma.tenant.updateMany.mock.calls;
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
      prisma.plan.findFirst.mockResolvedValueOnce({ id: 'starter' });
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
      prisma.plan.findFirst.mockResolvedValueOnce(null);
      prisma.plan.create.mockResolvedValueOnce({ id: 'starter' });
      prisma.tenant.create.mockResolvedValueOnce({
        id: 'tenant-2',
        subdomain: 'acme',
        planId: 'starter',
      });

      await service.create(baseDto, creator);

      expect(prisma.plan.create).toHaveBeenCalled();
    });

    it('translates Prisma P2002 unique violation into ConflictException', async () => {
      prisma.plan.findFirst.mockResolvedValueOnce({ id: 'starter' });
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['subdomain'] },
        },
      );
      prisma.tenant.create.mockRejectedValueOnce(p2002);

      await expect(service.create(baseDto, creator)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(amqp.publish).not.toHaveBeenCalled();
    });
  });

  describe('saga handlers', () => {
    it('handleDbReady completes db and starts dns only while dns is PENDING', async () => {
      prisma.tenant.update.mockResolvedValueOnce({});
      prisma.tenant.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.handleDbReady({
        tenantId: 't',
        subdomain: 's',
        planId: 'p',
      });

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 't' },
        data: { dbStatus: StepStatus.SUCCESS },
      });
      expect(prisma.tenant.updateMany).toHaveBeenCalledWith({
        where: { id: 't', dnsStatus: StepStatus.PENDING },
        data: { dnsStatus: StepStatus.IN_PROGRESS },
      });
    });

    it('handleProvisioningComplete sets ACTIVE via the enum (not a string literal)', async () => {
      prisma.tenant.update.mockResolvedValueOnce({});

      await service.handleProvisioningComplete({
        tenantId: 't',
        subdomain: 's',
      });

      const [[updateCall]] = prisma.tenant.update.mock.calls;
      expect(updateCall.data.status).toBe(TenantStatus.ACTIVE);
      expect(updateCall.data.notificationStatus).toBe(StepStatus.SUCCESS);
    });

    it('notifies the company webhook once the tenant is ACTIVE', async () => {
      prisma.tenant.update.mockResolvedValueOnce({});

      await service.handleProvisioningComplete({
        tenantId: 't',
        subdomain: 's',
      });

      expect(webhooks.notify).toHaveBeenCalledWith('t', 'tenant.active');
    });

    it('does not notify the webhook when activation fails', async () => {
      prisma.tenant.update.mockRejectedValueOnce(new Error('gone'));

      await service.handleProvisioningComplete({
        tenantId: 't',
        subdomain: 's',
      });

      expect(webhooks.notify).not.toHaveBeenCalled();
    });
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
      prisma.tenant.update.mockImplementation(({ data }) => {
        Object.assign(row, data);
        return Promise.resolve(row);
      });
      prisma.tenant.updateMany.mockImplementation(({ where = {}, data }) => {
        if (!matches(where)) {
          return Promise.resolve({ count: 0 });
        }
        Object.assign(row, data);
        return Promise.resolve({ count: 1 });
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
    });

    it('leaves a tenant that is gone, active or cancelled alone', async () => {
      prisma.tenant.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.failStep('t', 'dbStatus', 'x')).resolves.toBe(false);
      expect(prisma.eventLog.create).not.toHaveBeenCalled();
      expect(webhooks.notify).not.toHaveBeenCalled();
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

    it("lists only the organisation's customer tenants", async () => {
      prisma.tenant.findMany.mockResolvedValueOnce([]);

      await service.findAll('org-1');

      expect(prisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: inOrg }),
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

    it('cancels in-progress + pending steps and publishes tenant.cancelled', async () => {
      prisma.tenant.findFirst.mockResolvedValueOnce(provisioningTenant);
      prisma.tenant.update.mockResolvedValueOnce({
        ...provisioningTenant,
        status: TenantStatus.CANCELLED,
      });

      await service.cancel('t', 'org-1', 'user changed mind');

      const [[{ data: update }]] = prisma.tenant.update.mock.calls;
      expect(update.status).toBe(TenantStatus.CANCELLED);
      // Already-SUCCESS steps stay SUCCESS, others go CANCELLED.
      expect(update.dbStatus).toBe(StepStatus.SUCCESS);
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

    it('throws BadRequestException when tenant is not in PROVISIONING state', async () => {
      prisma.tenant.findFirst.mockResolvedValueOnce({
        ...provisioningTenant,
        status: TenantStatus.ACTIVE,
      });

      await expect(service.cancel('t', 'org-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.tenant.update).not.toHaveBeenCalled();
    });

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

  describe('delete', () => {
    it('emits tenant.deleted before removing the row (so consumers can clean up)', async () => {
      prisma.tenant.findFirst.mockResolvedValueOnce({
        id: 't',
        subdomain: 'acme',
        organisationId: 'org-1',
      });
      prisma.tenant.delete.mockResolvedValueOnce({ id: 't' });

      await service.delete('t', 'org-1');

      // Order matters: publish must precede delete.
      const publishOrder = amqp.publish.mock.invocationCallOrder[0];
      const deleteOrder = prisma.tenant.delete.mock.invocationCallOrder[0];
      expect(publishOrder).toBeLessThan(deleteOrder);
    });
  });
});
