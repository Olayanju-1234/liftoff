import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { StepStatus, TenantStatus } from '.prisma/tenant-client';
import type { CustomStepRequest } from '@liftoff/shared-types';

import { TenantsService } from './tenants.service';
import { CustomStepsService } from './custom-steps.service';
import { PrismaService } from '../prisma.service';
import { WebhookService } from '../webhooks/webhook.service';
import { QuotasService } from './quotas.service';
import { StatusTokenService } from '../status/status-token.service';

type Row = Record<string, unknown>;

// A where value is the expected value, or an { in }, { lt } or { not } filter.
function matches(record: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (
      condition &&
      typeof condition === 'object' &&
      !(condition instanceof Date)
    ) {
      const filter = condition as { in?: unknown[]; lt?: Date; not?: unknown };
      if (filter.in) return filter.in.includes(record[field]);
      if (filter.lt) return (record[field] as Date) < filter.lt;
      if ('not' in filter) return record[field] !== filter.not;
      return false;
    }
    return record[field] === condition;
  });
}

const newestFirst = (a: Row, b: Row) =>
  (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime();

// Waits for the background delivery of a custom step request and what follows it.
const settle = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

const TENANT_ID = 'ctenant00000000000000000001';
const URL_BASE = 'https://steps.acme.com';

describe('Custom steps (dispatch, callbacks, timeouts)', () => {
  let service: TenantsService;
  let customSteps: CustomStepsService;
  let row: Row;
  let org: Row;
  let calls: Row[];
  let events: { eventType: string; status: string; payload: Row }[];
  let amqp: { publish: jest.Mock };
  let webhooks: { notify: jest.Mock; post: jest.Mock; tenantRecord: jest.Mock };

  const published = (queue: string): unknown[][] =>
    (amqp.publish.mock.calls as unknown[][]).filter(([, key]) => key === queue);
  const eventsOf = (type: string) =>
    events.filter((event) => event.eventType === type);
  const requestBody = (call = 0) =>
    JSON.parse(
      (webhooks.post.mock.calls[call] as [{ body: string }])[0].body,
    ) as CustomStepRequest<{ id: string }>;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    row = {
      id: TENANT_ID,
      name: 'Globex',
      subdomain: 'globex',
      planId: 'starter',
      schemaName: 'tenant_acme_globex',
      organisationId: 'org-1',
      isWorkspace: false,
      isTest: false,
      status: TenantStatus.PROVISIONING,
      dbStatus: StepStatus.IN_PROGRESS,
      dnsStatus: StepStatus.PENDING,
      credentialsStatus: StepStatus.PENDING,
      billingStatus: StepStatus.PENDING,
      notificationStatus: StepStatus.PENDING,
      stepModes: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    };
    org = {
      handle: 'acme',
      baseDomain: null,
      plans: null,
      stepConfig: null,
      webhookUrl: 'https://hooks.acme.com/liftoff',
      webhookSecret: 'whsec_test',
    };
    calls = [];
    events = [];
    let seq = 0;

    const prisma = {
      tenant: {
        create: jest.fn(({ data }: { data: Row }) => {
          Object.assign(row, data);
          return Promise.resolve({ ...row });
        }),
        findUnique: jest.fn(
          ({
            where,
            include,
            select,
          }: {
            where: Row;
            include?: Row;
            select?: Row;
          }) => {
            if (where.id !== row.id) return Promise.resolve(null);
            if (select) {
              return Promise.resolve(
                Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])),
              );
            }
            return Promise.resolve({
              ...row,
              ...(include?.organisation ? { organisation: { ...org } } : {}),
            });
          },
        ),
        findFirst: jest.fn(({ where }: { where: Row }) =>
          Promise.resolve(
            matches(row, where)
              ? {
                  ...row,
                  plan: { id: 'starter' },
                  events: [],
                  organisation: org,
                }
              : null,
          ),
        ),
        update: jest.fn(({ data }: { data: Row }) => {
          Object.assign(row, data);
          return Promise.resolve({ ...row });
        }),
        updateMany: jest.fn(({ where, data }: { where: Row; data: Row }) => {
          if (!matches(row, where)) return Promise.resolve({ count: 0 });
          Object.assign(row, data);
          return Promise.resolve({ count: 1 });
        }),
        count: jest.fn().mockResolvedValue(0),
      },
      customStepCall: {
        create: jest.fn(({ data }: { data: Row }) => {
          seq++;
          const call: Row = {
            id: `call-${seq}`,
            status: StepStatus.IN_PROGRESS,
            completedAt: null,
            error: null,
            output: null,
            createdAt: new Date(Date.now() + seq),
            ...data,
          };
          calls.push(call);
          return Promise.resolve({ ...call });
        }),
        updateMany: jest.fn(({ where, data }: { where: Row; data: Row }) => {
          const hit = calls.filter((call) => matches(call, where));
          hit.forEach((call) => Object.assign(call, data));
          return Promise.resolve({ count: hit.length });
        }),
        findFirst: jest.fn(({ where }: { where: Row }) => {
          const [found] = calls
            .filter((call) => matches(call, where))
            .sort(newestFirst);
          return Promise.resolve(found ? { ...found } : null);
        }),
        findUnique: jest.fn(({ where }: { where: Row }) =>
          Promise.resolve(calls.find((call) => call.id === where.id) ?? null),
        ),
        findMany: jest.fn(({ where }: { where?: Row }) =>
          Promise.resolve(
            calls
              .filter((call) => matches(call, where))
              .sort(newestFirst)
              .map((call) => ({ ...call })),
          ),
        ),
      },
      organisation: { findUnique: jest.fn(() => Promise.resolve({ ...org })) },
      plan: { findUnique: jest.fn().mockResolvedValue({ id: 'starter' }) },
      eventLog: {
        create: jest.fn(({ data }: { data: (typeof events)[number] }) => {
          events.push(data);
          return Promise.resolve(data);
        }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    amqp = { publish: jest.fn().mockResolvedValue(undefined) };
    webhooks = {
      notify: jest.fn(),
      post: jest.fn().mockResolvedValue({ delivered: true, status: 202 }),
      tenantRecord: jest.fn((tenant: Row) => ({
        id: tenant.id,
        name: tenant.name,
      })),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TenantsService,
        CustomStepsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AmqpConnection, useValue: amqp },
        { provide: WebhookService, useValue: webhooks },
        {
          provide: QuotasService,
          useValue: {
            assertCanProvision: jest.fn().mockResolvedValue({}),
            record: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: StatusTokenService,
          useValue: {
            hashFor: (id: string) => `hash(${id})`,
            urlFor: (id: string) => `https://app.test/status/tok(${id})`,
          },
        },
        {
          provide: ConfigService,
          useValue: { get: () => 'https://api.test/' },
        },
      ],
    }).compile();
    service = moduleRef.get(TenantsService);
    customSteps = moduleRef.get(CustomStepsService);
  });

  afterEach(() => jest.restoreAllMocks());

  const dbReady = () =>
    service.handleDbReady({
      tenantId: TENANT_ID,
      subdomain: 'globex',
      planId: 'starter',
    });
  const dnsReady = () =>
    service.handleDnsReady({
      tenantId: TENANT_ID,
      subdomain: 'globex',
      planId: 'starter',
    });
  const billingActive = () =>
    service.handleBillingActive({
      tenantId: TENANT_ID,
      subdomain: 'globex',
      planId: 'starter',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      subscriptionStatus: 'trialing',
      trialEnd: null,
    });
  const atStep = (column: string) => {
    const order = [
      'dbStatus',
      'dnsStatus',
      'credentialsStatus',
      'billingStatus',
      'notificationStatus',
    ];
    order.forEach((step, i) => {
      const at = order.indexOf(column);
      row[step] =
        i < at
          ? StepStatus.SUCCESS
          : i === at
            ? StepStatus.IN_PROGRESS
            : StepStatus.PENDING;
    });
  };
  const custom = (step: string, extra: Row = {}) => {
    org.stepConfig = {
      [step]: { mode: 'custom', url: `${URL_BASE}/${step}`, ...extra },
    };
  };
  const callback = (
    outcome: 'complete' | 'fail',
    step = 'credentials',
    body: Row = {},
    organisationId = 'org-1',
  ) =>
    service.customStepCallback(
      TENANT_ID,
      organisationId,
      step as 'credentials',
      outcome === 'complete' ? StepStatus.SUCCESS : StepStatus.FAILED,
      body,
    );

  describe('dispatch', () => {
    it("sends a builtin step's input straight to its worker's queue and records how it ran", async () => {
      await dbReady();

      expect(row).toMatchObject({
        dbStatus: StepStatus.SUCCESS,
        dnsStatus: StepStatus.IN_PROGRESS,
        stepModes: { address: 'builtin' },
      });
      expect(amqp.publish).toHaveBeenCalledWith(
        '',
        'dns-provisioner-queue',
        { tenantId: TENANT_ID, subdomain: 'globex', planId: 'starter' },
        { timeout: 5_000 },
      );
      expect(webhooks.post).not.toHaveBeenCalled();
    });

    it('marks a skipped step SKIPPED and starts the next with its input rebuilt from the row', async () => {
      org.stepConfig = { address: { mode: 'skipped' } };

      await dbReady();

      expect(row).toMatchObject({
        dnsStatus: StepStatus.SKIPPED,
        credentialsStatus: StepStatus.IN_PROGRESS,
        stepModes: { address: 'skipped', credentials: 'builtin' },
      });
      expect(published('dns-provisioner-queue')).toHaveLength(0);
      expect(amqp.publish).toHaveBeenCalledWith(
        '',
        'credentials-queue',
        { tenantId: TENANT_ID, subdomain: 'globex', planId: 'starter' },
        { timeout: 5_000 },
      );
      expect(eventsOf('tenant.step.skipped')).toEqual([
        expect.objectContaining({
          status: 'Success',
          payload: { step: 'address', reason: 'Skipped in your step settings' },
        }),
      ]);
    });

    it('activates the tenant when the welcome step is skipped, with no email and the ready webhook', async () => {
      org.stepConfig = { welcome: { mode: 'skipped' } };
      atStep('billingStatus');

      await billingActive();

      expect(row).toMatchObject({
        status: TenantStatus.ACTIVE,
        billingStatus: StepStatus.SUCCESS,
        notificationStatus: StepStatus.SKIPPED,
      });
      expect(published('notification-queue')).toHaveLength(0);
      expect(eventsOf('tenant.provisioning.complete')).toHaveLength(1);
      expect(webhooks.notify).toHaveBeenCalledWith(TENANT_ID, 'tenant.active');
    });

    it('skips several steps in a row and runs the first builtin one after them', async () => {
      org.stepConfig = {
        address: { mode: 'skipped' },
        credentials: { mode: 'skipped' },
        billing: { mode: 'skipped' },
      };

      await dbReady();

      expect(row).toMatchObject({
        dnsStatus: StepStatus.SKIPPED,
        credentialsStatus: StepStatus.SKIPPED,
        billingStatus: StepStatus.SKIPPED,
        notificationStatus: StepStatus.IN_PROGRESS,
      });
      expect(amqp.publish).toHaveBeenCalledWith(
        '',
        'notification-queue',
        expect.objectContaining({ tenantId: TENANT_ID }),
        { timeout: 5_000 },
      );
    });

    it("POSTs step.requested to the company's URL and publishes nothing for that step", async () => {
      custom('credentials', { timeoutMs: 120_000 });
      atStep('dnsStatus');

      await dnsReady();
      await settle();

      expect(row).toMatchObject({
        dnsStatus: StepStatus.SUCCESS,
        credentialsStatus: StepStatus.IN_PROGRESS,
        stepModes: { credentials: 'custom' },
      });
      expect(published('credentials-queue')).toHaveLength(0);
      expect(calls).toHaveLength(1);
      const [call] = calls;
      expect(call).toMatchObject({
        tenantId: TENANT_ID,
        step: 'credentials',
        action: 'provision',
        url: `${URL_BASE}/credentials`,
        status: StepStatus.IN_PROGRESS,
      });
      const wait = (call.deadlineAt as Date).getTime() - Date.now();
      expect(wait).toBeGreaterThan(110_000);
      expect(wait).toBeLessThanOrEqual(120_000);

      const [[post]] = webhooks.post.mock.calls as [
        [{ url: URL; secret: string; event: string }],
      ];
      expect(post.url.toString()).toBe(`${URL_BASE}/credentials`);
      expect(post.secret).toBe('whsec_test');
      expect(post.event).toBe('step.requested');
      expect(requestBody()).toEqual({
        event: 'step.requested',
        step: 'credentials',
        requestId: call.id,
        callbackUrl: `https://api.test/tenants/${TENANT_ID}/steps/credentials`,
        deadline: (call.deadlineAt as Date).toISOString(),
        tenant: { id: TENANT_ID, name: 'Globex' },
      });
      expect(eventsOf('tenant.step.requested')).toEqual([
        expect.objectContaining({
          payload: expect.objectContaining({
            step: 'credentials',
            requestId: call.id,
          }) as unknown,
        }),
      ]);
    });

    it("fails the step when the company's system does not take the request", async () => {
      custom('credentials');
      atStep('dnsStatus');
      webhooks.post.mockResolvedValueOnce({
        delivered: false,
        status: 404,
        error: 'rejected with 404',
      });

      await dnsReady();
      await settle();

      expect(calls[0]).toMatchObject({ status: StepStatus.FAILED });
      expect(row).toMatchObject({
        status: TenantStatus.FAILED,
        credentialsStatus: StepStatus.FAILED,
      });
      expect(eventsOf('tenant.provisioning.failed')).toEqual([
        expect.objectContaining({
          payload: expect.objectContaining({
            step: 'credentialsStatus',
            error:
              'Your system did not take the credentials request: rejected with 404',
            requestId: calls[0].id,
          }) as unknown,
        }),
      ]);
      expect(webhooks.notify).toHaveBeenCalledWith(TENANT_ID, 'tenant.failed');
    });

    it('does not fail a step whose callback arrived while the request was being retried', async () => {
      custom('credentials');
      atStep('dnsStatus');
      webhooks.post.mockResolvedValueOnce({
        delivered: false,
        abandoned: true,
      });

      await dnsReady();
      await settle();

      expect(row.status).toBe(TenantStatus.PROVISIONING);
      expect(eventsOf('tenant.provisioning.failed')).toHaveLength(0);
    });

    it('fails a custom step that has no URL rather than running anything', async () => {
      org.stepConfig = { credentials: { mode: 'custom' } };
      atStep('dnsStatus');

      await dnsReady();

      expect(row).toMatchObject({
        status: TenantStatus.FAILED,
        credentialsStatus: StepStatus.FAILED,
      });
      expect(calls).toHaveLength(0);
      expect(published('credentials-queue')).toHaveLength(0);
    });

    it('starts a custom first step on create and answers with the customer waiting on it', async () => {
      custom('database');

      const created = await service.create(
        { name: 'Globex', subdomain: 'globex', planId: 'starter' },
        { organisationId: 'org-1', ownerId: 'user-1' },
      );
      await settle();

      expect(published('db-provisioner-queue')).toHaveLength(0);
      expect(calls).toEqual([
        expect.objectContaining({ step: 'database', action: 'provision' }),
      ]);
      expect(created).toMatchObject({
        dbStatus: StepStatus.IN_PROGRESS,
        stepModes: { database: 'custom' },
      });
    });

    it('answers create with the row as it is after a skipped first step', async () => {
      org.stepConfig = { database: { mode: 'skipped' } };

      const created = await service.create(
        { name: 'Globex', subdomain: 'globex', planId: 'starter' },
        { organisationId: 'org-1', ownerId: 'user-1' },
      );

      expect(created).toMatchObject({
        dbStatus: StepStatus.SKIPPED,
        dnsStatus: StepStatus.IN_PROGRESS,
        stepModes: { database: 'skipped', address: 'builtin' },
      });
      expect(published('dns-provisioner-queue')).toHaveLength(1);
    });
  });

  describe('callbacks', () => {
    beforeEach(async () => {
      custom('credentials');
      atStep('dnsStatus');
      await dnsReady();
      await settle();
    });

    it('records a completed step with its output and starts the next one', async () => {
      const result = await callback('complete', 'credentials', {
        requestId: 'call-1',
        output: { keyId: 'key_123' },
      });

      expect(result).toEqual({
        tenantId: TENANT_ID,
        step: 'credentials',
        action: 'provision',
        outcome: 'recorded',
        status: TenantStatus.PROVISIONING,
      });
      expect(calls[0]).toMatchObject({
        status: StepStatus.SUCCESS,
        output: { keyId: 'key_123' },
      });
      expect(row).toMatchObject({
        credentialsStatus: StepStatus.SUCCESS,
        billingStatus: StepStatus.IN_PROGRESS,
      });
      expect(amqp.publish).toHaveBeenCalledWith(
        '',
        'billing-queue',
        { tenantId: TENANT_ID, subdomain: 'globex', planId: 'starter' },
        { timeout: 5_000 },
      );
      expect(eventsOf('tenant.step.completed')).toEqual([
        expect.objectContaining({
          payload: {
            step: 'credentials',
            requestId: 'call-1',
            output: { keyId: 'key_123' },
          },
        }),
      ]);
    });

    it('answers a repeated complete as a duplicate and starts nothing twice', async () => {
      await callback('complete');
      const again = await callback('complete');

      expect(again.outcome).toBe('duplicate');
      expect(published('billing-queue')).toHaveLength(1);
      expect(eventsOf('tenant.step.completed')).toHaveLength(1);
    });

    it("fails the step and the customer with the company's reason", async () => {
      const result = await callback('fail', 'credentials', {
        error: 'No capacity left in eu-west-1',
      });

      expect(result).toMatchObject({
        outcome: 'recorded',
        status: TenantStatus.FAILED,
      });
      expect(calls[0]).toMatchObject({
        status: StepStatus.FAILED,
        error: 'No capacity left in eu-west-1',
      });
      expect(row).toMatchObject({
        status: TenantStatus.FAILED,
        credentialsStatus: StepStatus.FAILED,
        billingStatus: StepStatus.PENDING,
      });
      expect(eventsOf('tenant.provisioning.failed')).toEqual([
        expect.objectContaining({
          payload: expect.objectContaining({
            error: 'No capacity left in eu-west-1',
          }) as unknown,
        }),
      ]);
      expect(webhooks.notify).toHaveBeenCalledWith(TENANT_ID, 'tenant.failed');
    });

    it('fails with a plain reason when the company gives none, and a repeat is a duplicate', async () => {
      await callback('fail');
      const again = await callback('fail');

      expect(calls[0].error).toBe('Your system reported that the step failed');
      expect(again.outcome).toBe('duplicate');
      expect(eventsOf('tenant.provisioning.failed')).toHaveLength(1);
    });

    it('refuses complete after fail with 409, pointing at Retry', async () => {
      await callback('fail', 'credentials', { error: 'boom' });
      await expect(callback('complete')).rejects.toThrow(
        'The credentials step already failed (boom). Retry the customer to request it again.',
      );
    });

    it('refuses fail after complete with 409', async () => {
      await callback('complete');
      await expect(callback('fail')).rejects.toBeInstanceOf(ConflictException);
      expect(row.status).toBe(TenantStatus.PROVISIONING);
    });

    it.each([
      TenantStatus.CANCELLED,
      TenantStatus.DEPROVISIONING,
      TenantStatus.DELETED,
    ])(
      'ignores a late callback for a %s customer and changes nothing',
      async (status) => {
        row.status = status;
        const before = { ...row };

        const result = await callback('complete');

        expect(result).toMatchObject({ outcome: 'ignored', status });
        expect(result.reason).toContain(status.toLowerCase());
        expect(row).toEqual(before);
        expect(calls[0].status).toBe(StepStatus.IN_PROGRESS);
      },
    );

    it('refuses a callback for a step that is not waiting on the company', async () => {
      await expect(callback('complete', 'billing')).rejects.toThrow(
        'The billing step of this customer is not waiting on your system',
      );
    });

    it('refuses a callback naming an older request', async () => {
      await expect(
        callback('complete', 'credentials', { requestId: 'call-0' }),
      ).rejects.toThrow('is not the latest request');
      expect(calls[0].status).toBe(StepStatus.IN_PROGRESS);
    });

    it("answers 404 for another company's customer", async () => {
      await expect(
        callback('complete', 'credentials', {}, 'org-2'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('answers from whatever closed the request first when two callbacks race', async () => {
      jest.spyOn(customSteps, 'close').mockImplementationOnce(() => {
        calls[0].status = StepStatus.SUCCESS;
        return Promise.resolve(false);
      });

      const result = await callback('complete');

      expect(result.outcome).toBe('duplicate');
      expect(published('billing-queue')).toHaveLength(0);
    });

    it('activates the customer when the custom welcome step completes', async () => {
      custom('welcome');
      atStep('billingStatus');
      await billingActive();
      await settle();

      const result = await callback('complete', 'welcome');

      expect(result).toMatchObject({
        outcome: 'recorded',
        status: TenantStatus.ACTIVE,
      });
      expect(row).toMatchObject({
        status: TenantStatus.ACTIVE,
        notificationStatus: StepStatus.SUCCESS,
      });
      expect(eventsOf('tenant.provisioning.complete')).toEqual([
        expect.objectContaining({
          payload: { tenantId: TENANT_ID, welcome: 'custom' },
        }),
      ]);
      expect(webhooks.notify).toHaveBeenCalledWith(TENANT_ID, 'tenant.active');
    });
  });

  describe('timeout', () => {
    beforeEach(async () => {
      custom('credentials', { timeoutMs: 120_000 });
      atStep('dnsStatus');
      await dnsReady();
      await settle();
    });

    it('fails a request whose deadline passed, saying how long the company had', async () => {
      const [call] = await customSteps.overdue(new Date(Date.now() + 121_000));

      await expect(service.timeOutCustomStep(call)).resolves.toBe(true);

      expect(calls[0].status).toBe(StepStatus.FAILED);
      expect(row).toMatchObject({
        status: TenantStatus.FAILED,
        credentialsStatus: StepStatus.FAILED,
      });
      expect(eventsOf('tenant.provisioning.failed')[0].payload.error).toBe(
        'Your system did not call back within 2 minutes',
      );
      await expect(callback('complete')).rejects.toThrow(
        'did not call back within 2 minutes',
      );
    });

    it('leaves a request alone once the callback is in', async () => {
      const [call] = await customSteps.overdue(new Date(Date.now() + 121_000));
      await callback('complete');

      await expect(service.timeOutCustomStep(call)).resolves.toBe(false);
      expect(row.status).toBe(TenantStatus.PROVISIONING);
    });
  });

  describe('retry, cancel and reads', () => {
    beforeEach(async () => {
      custom('credentials');
      atStep('dnsStatus');
      await dnsReady();
      await settle();
    });

    it('requests a failed custom step again with a new requestId', async () => {
      await callback('fail', 'credentials', { error: 'boom' });

      await service.retry(TENANT_ID, 'org-1');
      await settle();

      expect(row).toMatchObject({
        status: TenantStatus.PROVISIONING,
        credentialsStatus: StepStatus.IN_PROGRESS,
      });
      expect(calls.map((call) => call.status)).toEqual([
        StepStatus.FAILED,
        StepStatus.IN_PROGRESS,
      ]);
      expect(requestBody(1).requestId).toBe('call-2');
      expect(eventsOf('tenant.retry')).toEqual([
        expect.objectContaining({
          payload: { step: 'credentialsStatus', mode: 'custom' },
        }),
      ]);
      await expect(
        callback('complete', 'credentials', { requestId: 'call-1' }),
      ).rejects.toThrow('is not the latest request');
      await expect(
        callback('complete', 'credentials', { requestId: 'call-2' }),
      ).resolves.toMatchObject({ outcome: 'recorded' });
    });

    it('skips the step on retry once the company switched it to skipped', async () => {
      await callback('fail');
      org.stepConfig = { credentials: { mode: 'skipped' } };

      await service.retry(TENANT_ID, 'org-1');

      expect(row).toMatchObject({
        status: TenantStatus.PROVISIONING,
        credentialsStatus: StepStatus.SKIPPED,
        billingStatus: StepStatus.IN_PROGRESS,
      });
      expect(published('billing-queue')).toHaveLength(1);
    });

    it('stops listening to the company once the customer is cancelled', async () => {
      await service.cancel(TENANT_ID, 'org-1', 'Changed their mind');

      expect(calls[0]).toMatchObject({
        status: StepStatus.CANCELLED,
        error: 'The customer was cancelled',
      });
      expect(row.credentialsStatus).toBe(StepStatus.CANCELLED);
      await expect(callback('complete')).resolves.toMatchObject({
        outcome: 'ignored',
      });
    });

    it('shows how each step ran and the latest request per step on the tenant', async () => {
      const tenant = await service.findOne(TENANT_ID, 'org-1');

      expect(tenant.stepModes).toEqual({ credentials: 'custom' });
      expect(tenant.customSteps).toEqual([
        expect.objectContaining({
          step: 'credentials',
          action: 'provision',
          requestId: 'call-1',
          status: StepStatus.IN_PROGRESS,
          url: `${URL_BASE}/credentials`,
        }),
      ]);
    });
  });
});
