import {
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, StepStatus, TenantStatus } from '.prisma/tenant-client';
import { PrismaService } from '../prisma.service';
import { TenantsService } from '../tenants/tenants.service';
import { StatusTokenService } from '../status/status-token.service';
import { hashStatusToken } from '../status/status-token';
import {
  DEMO_HANDLE,
  DEMO_MAX_LIVE,
  DEMO_TTL_MS,
  DemoBusyException,
  DemoService,
} from './demo.service';

const TOKEN = 'a'.repeat(43);

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

const run = (overrides: Record<string, unknown> = {}) => ({
  id: 'tenant-d',
  name: 'Kestrel ABCD',
  subdomain: 'kestrelabcd',
  status: TenantStatus.FAILED,
  planId: 'pro',
  organisationId: 'org-demo',
  ownerId: null,
  statusTokenHash: hashStatusToken(TOKEN),
  dbStatus: StepStatus.SUCCESS,
  dnsStatus: StepStatus.SUCCESS,
  credentialsStatus: StepStatus.SUCCESS,
  billingStatus: StepStatus.FAILED,
  notificationStatus: StepStatus.PENDING,
  teardownDbStatus: null,
  teardownCredentialsStatus: null,
  teardownBillingStatus: null,
  stepModes: { database: 'builtin', billing: 'builtin' },
  schemaName: 'tenant_liftoff_demo_kestrelabcd',
  isTest: true,
  cancelledAt: null,
  cancelReason: null,
  deletedAt: null,
  createdAt: new Date('2026-10-23T12:00:00Z'),
  updatedAt: new Date('2026-10-23T12:00:05Z'),
  demo: {
    tenantId: 'tenant-d',
    failStep: 'billing',
    failInjectedAt: new Date('2026-10-23T12:00:04Z'),
    expiresAt: new Date('2026-10-23T12:15:00Z'),
    removedAt: null,
    createdAt: new Date('2026-10-23T12:00:00Z'),
  },
  ...overrides,
});

describe('DemoService', () => {
  let service: DemoService;
  let prisma: {
    organisation: { findFirst: jest.Mock; create: jest.Mock };
    demoTenant: {
      count: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    tenant: { findUnique: jest.Mock };
    eventLog: { findMany: jest.Mock };
  };
  let tenants: { create: jest.Mock; retry: jest.Mock; delete: jest.Mock };
  const statusTokens = {
    tokenFor: jest.fn((id: string) => `tok(${id})`),
    urlFor: jest.fn((id: string) => `https://app.test/status/tok(${id})`),
  };

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma = {
      organisation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'org-demo' }),
        create: jest.fn(),
      },
      demoTenant: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      tenant: { findUnique: jest.fn().mockResolvedValue(run()) },
      eventLog: { findMany: jest.fn().mockResolvedValue([]) },
    };
    tenants = {
      create: jest.fn().mockResolvedValue({
        id: 'tenant-d',
        statusUrl: 'https://app.test/status/tok(tenant-d)',
      }),
      retry: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DemoService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantsService, useValue: tenants },
        { provide: StatusTokenService, useValue: statusTokens },
      ],
    }).compile();
    service = moduleRef.get(DemoService);
  });

  afterEach(() => jest.restoreAllMocks());

  // What the service passed to TenantsService.create on its first call.
  const created = () =>
    tenants.create.mock.calls[0] as [
      unknown,
      { organisationId: string },
      { failStep: string | null },
    ];

  describe('start', () => {
    it('provisions a test customer in the demo organisation, failing the chosen step', async () => {
      const before = Date.now();

      const started = await service.start({ failStep: 'billing' });

      const [[dto, creator, demo]] = tenants.create.mock.calls as [
        [
          { name: string; subdomain: string; planId: string; test: boolean },
          { organisationId: string; ownerId: null },
          { failStep: string | null; expiresAt: Date },
        ],
      ];
      expect(dto).toMatchObject({ planId: 'pro', test: true });
      expect(dto.subdomain).toMatch(/^[a-z]+$/);
      expect(creator).toEqual({ organisationId: 'org-demo', ownerId: null });
      expect(demo.failStep).toBe('billing');
      expect(demo.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + DEMO_TTL_MS,
      );
      expect(started).toEqual({
        token: 'tok(tenant-d)',
        statusUrl: 'https://app.test/status/tok(tenant-d)',
        expiresAt: demo.expiresAt.toISOString(),
      });
    });

    it('runs clean when no step is chosen', async () => {
      await service.start({});

      expect(created()[2]).toMatchObject({ failStep: null });
    });

    it('starts nothing when the demo is full', async () => {
      prisma.demoTenant.count.mockResolvedValueOnce(DEMO_MAX_LIVE);

      await expect(service.start({})).rejects.toBeInstanceOf(DemoBusyException);
      expect(prisma.demoTenant.count).toHaveBeenCalledWith({
        where: { removedAt: null },
      });
      expect(tenants.create).not.toHaveBeenCalled();
    });
  });

  describe('the demo organisation', () => {
    it('is created on first use when there is none', async () => {
      prisma.organisation.findFirst.mockResolvedValueOnce(null);
      prisma.organisation.create.mockResolvedValueOnce({ id: 'org-new' });

      await service.start({});

      expect(prisma.organisation.create).toHaveBeenCalledWith({
        data: { name: 'liftoff demo', handle: DEMO_HANDLE, isDemo: true },
        select: { id: true },
      });
      expect(created()[1]).toMatchObject({ organisationId: 'org-new' });
    });

    it('is looked up once and remembered', async () => {
      await service.start({});
      await service.start({});

      expect(prisma.organisation.findFirst).toHaveBeenCalledTimes(1);
    });

    it('keeps the demo off when a company already holds the handle', async () => {
      prisma.organisation.findFirst.mockResolvedValue(null);
      prisma.organisation.create.mockRejectedValueOnce(uniqueViolation());

      await expect(service.start({})).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(tenants.create).not.toHaveBeenCalled();
    });
  });

  describe('view', () => {
    it("shows the run's customer without the demo organisation's fields", async () => {
      const view = await service.view(TOKEN);

      expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { statusTokenHash: hashStatusToken(TOKEN) },
        include: { demo: true },
      });
      expect(view.tenant).toMatchObject({
        id: 'tenant-d',
        status: TenantStatus.FAILED,
        billingStatus: StepStatus.FAILED,
        planName: 'Pro',
        address: 'kestrelabcd.liftoff.ojusentinel.com',
        statusUrl: 'https://app.test/status/tok(tenant-d)',
      });
      expect(view.tenant).not.toHaveProperty('organisationId');
      expect(view.tenant).not.toHaveProperty('statusTokenHash');
      expect(view.demo).toEqual({
        failStep: 'billing',
        failedOnPurposeAt: '2026-10-23T12:00:04.000Z',
        expiresAt: '2026-10-23T12:15:00.000Z',
      });
    });

    it("answers 404 for a real customer's status token", async () => {
      prisma.tenant.findUnique.mockResolvedValueOnce(run({ demo: null }));

      await expect(service.view(TOKEN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('answers 404 for an unknown token', async () => {
      prisma.tenant.findUnique.mockResolvedValueOnce(null);

      await expect(service.events(TOKEN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.eventLog.findMany).not.toHaveBeenCalled();
    });
  });

  it("reads the run's events, newest first", async () => {
    await service.events(TOKEN);

    expect(prisma.eventLog.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-d' },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });
  });

  it('retries the run as the demo organisation', async () => {
    await service.retry(TOKEN);

    expect(tenants.retry).toHaveBeenCalledWith('tenant-d', 'org-demo');
  });

  describe('removeExpired', () => {
    it('removes every run past its expiry and marks it removed', async () => {
      prisma.demoTenant.findMany.mockResolvedValueOnce([
        { tenantId: 't1' },
        { tenantId: 't2' },
      ]);

      const removed = await service.removeExpired();

      expect(removed).toBe(2);
      expect(tenants.delete).toHaveBeenCalledWith('t1', 'org-demo');
      expect(tenants.delete).toHaveBeenCalledWith('t2', 'org-demo');
      expect(prisma.demoTenant.update).toHaveBeenCalledWith({
        where: { tenantId: 't1' },
        data: { removedAt: expect.any(Date) as unknown },
      });
    });

    it('leaves a run it could not remove for the next sweep and carries on', async () => {
      prisma.demoTenant.findMany.mockResolvedValueOnce([
        { tenantId: 't1' },
        { tenantId: 't2' },
      ]);
      tenants.delete.mockRejectedValueOnce(new Error('broker down'));

      const removed = await service.removeExpired();

      expect(removed).toBe(1);
      expect(prisma.demoTenant.update).toHaveBeenCalledTimes(1);
      expect(prisma.demoTenant.update).toHaveBeenCalledWith({
        where: { tenantId: 't2' },
        data: { removedAt: expect.any(Date) as unknown },
      });
    });

    it('does nothing, not even the organisation lookup, when nothing is due', async () => {
      expect(await service.removeExpired()).toBe(0);
      expect(prisma.organisation.findFirst).not.toHaveBeenCalled();
      expect(tenants.delete).not.toHaveBeenCalled();
    });
  });
});
