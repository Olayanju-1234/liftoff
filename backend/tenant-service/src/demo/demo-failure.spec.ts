import { Test } from '@nestjs/testing';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { StepStatus, TenantStatus } from '.prisma/tenant-client';
import { TenantsService } from '../tenants/tenants.service';
import { PrismaService } from '../prisma.service';
import { WebhookService } from '../webhooks/webhook.service';
import { QuotasService } from '../tenants/quotas.service';
import { StatusTokenService } from '../status/status-token.service';
import { CustomStepsService } from '../tenants/custom-steps.service';
import { DEAD_LETTER_REASON_HEADER } from '../tenants/dead-letters';
import { DEMO_ORGANISATION_ID } from './demo.constants';

// The live demo's failStep, injected in tenant-service's dispatch and nowhere else.
describe('demo failure injection', () => {
  let service: TenantsService;
  let amqp: { publish: jest.Mock };
  let prisma: {
    plan: { findUnique: jest.Mock; create: jest.Mock };
    tenant: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    demoTenant: { updateMany: jest.Mock };
    eventLog: { create: jest.Mock; findFirst: jest.Mock };
    organisation: { findUnique: jest.Mock };
  };

  const demoRow = (extra: object = {}) => ({
    id: 'ct1',
    name: 'Globex Robotics',
    subdomain: 'globexrobotics',
    planId: 'pro',
    schemaName: 'tenant_liftoff_demo_globexrobotics',
    organisationId: DEMO_ORGANISATION_ID,
    isWorkspace: false,
    isTest: true,
    status: TenantStatus.PROVISIONING,
    stepModes: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    dbStatus: StepStatus.SUCCESS,
    dnsStatus: StepStatus.IN_PROGRESS,
    credentialsStatus: StepStatus.PENDING,
    billingStatus: StepStatus.PENDING,
    notificationStatus: StepStatus.PENDING,
    ...extra,
  });

  beforeEach(async () => {
    amqp = { publish: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      plan: {
        findUnique: jest.fn().mockResolvedValue({ id: 'pro' }),
        create: jest.fn(),
      },
      tenant: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      demoTenant: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      eventLog: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      organisation: {
        findUnique: jest.fn().mockResolvedValue({
          handle: 'liftoff-demo',
          baseDomain: 'yoursaas.example',
          plans: null,
          stepConfig: null,
        }),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AmqpConnection, useValue: amqp },
        { provide: WebhookService, useValue: { notify: jest.fn() } },
        {
          provide: QuotasService,
          useValue: { assertCanProvision: jest.fn(), record: jest.fn() },
        },
        {
          provide: StatusTokenService,
          useValue: {
            hashFor: (id: string) => `hash(${id})`,
            urlFor: (id: string) => `https://app.test/status/tok(${id})`,
          },
        },
        { provide: CustomStepsService, useValue: { cancelOpen: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(TenantsService);
  });

  it('writes the demo row in the tenant insert and dead-letters the first db message', async () => {
    prisma.tenant.create.mockImplementationOnce(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(
          demoRow({ id: data.id, dbStatus: StepStatus.IN_PROGRESS }),
        ),
    );
    const demo = {
      tokenHash: 'th',
      ipHash: 'ih',
      failStep: 'db',
      expiresAt: new Date(),
    };

    await service.create(
      {
        name: 'Globex Robotics',
        subdomain: 'globexrobotics',
        planId: 'pro',
        test: true,
      },
      { organisationId: DEMO_ORGANISATION_ID, ownerId: null },
      demo,
    );

    const [[{ data }]] = prisma.tenant.create.mock.calls as [
      [{ data: Record<string, unknown> }],
    ];
    expect(data.demo).toEqual({ create: demo });
    expect(prisma.demoTenant.updateMany).toHaveBeenCalledWith({
      where: { tenantId: data.id, failStep: 'db', failInjectedAt: null },
      data: { failInjectedAt: expect.any(Date) as Date },
    });
    expect(amqp.publish).toHaveBeenCalledTimes(1);
    expect(amqp.publish).toHaveBeenCalledWith(
      'dlx.provisioning',
      'db-provisioner.failed',
      expect.objectContaining({ tenantId: data.id }),
      {
        timeout: 5_000,
        headers: {
          [DEAD_LETTER_REASON_HEADER]:
            'Demo: db-provisioner was told to fail, so its message went to dlx.provisioning as db-provisioner.failed',
        },
      },
    );
  });

  it('dead-letters a later step when it is dispatched', async () => {
    prisma.tenant.findUnique.mockResolvedValueOnce({
      ...demoRow(),
      organisation: { stepConfig: null },
    });

    await service.handleDbReady({
      tenantId: 'ct1',
      subdomain: 'globexrobotics',
      planId: 'pro',
      test: true,
    });

    expect(prisma.demoTenant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'ct1', failStep: 'dns', failInjectedAt: null },
      }),
    );
    expect(amqp.publish).toHaveBeenCalledWith(
      'dlx.provisioning',
      'dns-provisioner.failed',
      expect.anything(),
      expect.anything(),
    );
    expect(amqp.publish).not.toHaveBeenCalledWith(
      '',
      'dns-provisioner-queue',
      expect.anything(),
      expect.anything(),
    );
  });

  it('sends the step to its worker once the failure was used, or was never asked for', async () => {
    prisma.demoTenant.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.tenant.findUnique.mockResolvedValueOnce({
      ...demoRow(),
      organisation: { stepConfig: null },
    });

    await service.handleDbReady({
      tenantId: 'ct1',
      subdomain: 'globexrobotics',
      planId: 'pro',
      test: true,
    });

    expect(amqp.publish).toHaveBeenCalledWith(
      '',
      'dns-provisioner-queue',
      expect.anything(),
      { timeout: 5_000 },
    );
  });

  it.each([
    ['a test tenant of a real company', { organisationId: 'org-1' }],
    ['a non-test tenant', { isTest: false }],
  ])('never looks for a failure on %s', async (_, extra) => {
    prisma.tenant.findUnique.mockResolvedValueOnce({
      ...demoRow(extra),
      organisation: { stepConfig: null },
    });

    await service.handleDbReady({
      tenantId: 'ct1',
      subdomain: 'globexrobotics',
      planId: 'pro',
    });

    expect(prisma.demoTenant.updateMany).not.toHaveBeenCalled();
    expect(amqp.publish).toHaveBeenCalledWith(
      '',
      'dns-provisioner-queue',
      expect.anything(),
      { timeout: 5_000 },
    );
  });

  it('fails the step with the reason the injected dead letter carries', async () => {
    await service.handleDeadLetter(
      { tenantId: 'ct1', subdomain: 'globexrobotics', planId: 'pro' },
      {
        fields: { routingKey: 'dns-provisioner.failed' },
        properties: {
          headers: {
            [DEAD_LETTER_REASON_HEADER]:
              'Demo: dns-provisioner was told to fail',
          },
        },
      },
    );

    expect(prisma.eventLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'tenant.provisioning.failed',
        payload: {
          step: 'dnsStatus',
          error: 'Demo: dns-provisioner was told to fail',
          deadLetterKey: 'dns-provisioner.failed',
        },
      }) as unknown,
    });
  });

  it('retries through the real worker queue', async () => {
    prisma.tenant.findFirst.mockResolvedValueOnce(
      demoRow({
        status: TenantStatus.FAILED,
        dnsStatus: StepStatus.FAILED,
      }),
    );
    prisma.tenant.findUnique.mockResolvedValue(demoRow());

    await service.retry('ct1', DEMO_ORGANISATION_ID);

    expect(prisma.demoTenant.updateMany).not.toHaveBeenCalled();
    expect(amqp.publish).toHaveBeenCalledWith(
      '',
      'dns-provisioner-queue',
      expect.objectContaining({ tenantId: 'ct1' }),
      { timeout: 5_000 },
    );
  });
});
