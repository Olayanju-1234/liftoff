import { Logger, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, TenantStatus } from '.prisma/tenant-client';

import {
  ACTIVE_LIMIT_RETRY_AFTER_S,
  QuotaExceededException,
  QuotasService,
  ROLLING_DAY_MS,
  describeWait,
} from './quotas.service';
import { PrismaService } from '../prisma.service';

type MockPrisma = {
  organisation: { findUnique: jest.Mock };
  tenant: { count: jest.Mock };
  provisionLog: {
    count: jest.Mock<Promise<number>, [Prisma.ProvisionLogCountArgs]>;
    findFirst: jest.Mock;
    create: jest.Mock;
    deleteMany: jest.Mock<
      Promise<{ count: number }>,
      [Prisma.ProvisionLogDeleteManyArgs]
    >;
  };
};

describe('QuotasService', () => {
  let service: QuotasService;
  let prisma: MockPrisma;

  const limits = { maxActiveTenants: 10, maxProvisionsPerDay: 50 };

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma = {
      organisation: { findUnique: jest.fn().mockResolvedValue(limits) },
      tenant: { count: jest.fn().mockResolvedValue(0) },
      provisionLog: {
        count: jest
          .fn<Promise<number>, [Prisma.ProvisionLogCountArgs]>()
          .mockResolvedValue(0),
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest
          .fn<Promise<{ count: number }>, [Prisma.ProvisionLogDeleteManyArgs]>()
          .mockResolvedValue({ count: 0 }),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [QuotasService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(QuotasService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('counts provisioning and active customer tenants, never the workspace tenant', async () => {
    prisma.tenant.count.mockResolvedValueOnce(3);
    prisma.provisionLog.count.mockResolvedValueOnce(7);

    await expect(service.usage('org-1')).resolves.toEqual({
      ...limits,
      activeTenants: 3,
      provisionsToday: 7,
    });

    expect(prisma.tenant.count).toHaveBeenCalledWith({
      where: {
        organisationId: 'org-1',
        isWorkspace: false,
        isTest: false,
        status: { in: [TenantStatus.PROVISIONING, TenantStatus.ACTIVE] },
      },
    });
    const [[{ where }]] = prisma.provisionLog.count.mock.calls;
    const since = (where?.createdAt as { gte: Date }).gte.getTime();
    expect(Date.now() - since).toBeGreaterThan(ROLLING_DAY_MS - 5_000);
    expect(Date.now() - since).toBeLessThanOrEqual(ROLLING_DAY_MS + 5_000);
  });

  it('lets a provision through under both limits', async () => {
    prisma.tenant.count.mockResolvedValueOnce(9);
    prisma.provisionLog.count.mockResolvedValueOnce(49);

    await expect(service.assertCanProvision('org-1')).resolves.toMatchObject({
      activeTenants: 9,
      provisionsToday: 49,
    });
  });

  it('answers 429 with an hour to wait at the active tenant limit', async () => {
    prisma.tenant.count.mockResolvedValueOnce(10);

    const error = (await service
      .assertCanProvision('org-1')
      .catch((e: unknown) => e)) as QuotaExceededException;

    expect(error).toBeInstanceOf(QuotaExceededException);
    expect(error.getStatus()).toBe(429);
    expect(error.retryAfterSeconds).toBe(ACTIVE_LIMIT_RETRY_AFTER_S);
    expect(error.message).toBe(
      "Your organisation has 10 active tenants and the limit is 10. Delete or cancel one, or contact support to raise the limit. Test tenants (test: true) don't count.",
    );
  });

  it('answers 429 at the daily limit with Retry-After until the oldest provision leaves the window', async () => {
    prisma.provisionLog.count.mockResolvedValueOnce(50);
    const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000);
    prisma.provisionLog.findFirst.mockResolvedValueOnce({
      createdAt: twentyHoursAgo,
    });

    const error = (await service
      .assertCanProvision('org-1')
      .catch((e: unknown) => e)) as QuotaExceededException;

    expect(error).toBeInstanceOf(QuotaExceededException);
    expect(error.retryAfterSeconds).toBeGreaterThan(4 * 3600 - 5);
    expect(error.retryAfterSeconds).toBeLessThanOrEqual(4 * 3600);
    expect(error.message).toContain('50 tenants in the last 24 hours');
    expect(error.message).toContain('Try again in about 4 hours');
    expect(error.getResponse()).toMatchObject({
      statusCode: 429,
      retryAfter: error.retryAfterSeconds,
    });
  });

  it('honours limits raised on the organisation row', async () => {
    prisma.organisation.findUnique.mockResolvedValueOnce({
      maxActiveTenants: 100,
      maxProvisionsPerDay: 500,
    });
    prisma.tenant.count.mockResolvedValueOnce(42);
    prisma.provisionLog.count.mockResolvedValueOnce(120);

    await expect(service.assertCanProvision('org-1')).resolves.toMatchObject({
      maxActiveTenants: 100,
    });
  });

  it('404s for an unknown organisation', async () => {
    prisma.organisation.findUnique.mockResolvedValueOnce(null);
    await expect(service.assertCanProvision('org-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('records a provision and swallows a failed write', async () => {
    await service.record('org-1', 't1');
    expect(prisma.provisionLog.create).toHaveBeenCalledWith({
      data: { organisationId: 'org-1', tenantId: 't1' },
    });

    prisma.provisionLog.create.mockRejectedValueOnce(new Error('db gone'));
    await expect(service.record('org-1', 't2')).resolves.toBeUndefined();
  });

  it('purges log rows older than two days', async () => {
    prisma.provisionLog.deleteMany.mockResolvedValueOnce({ count: 4 });
    await expect(service.purgeOld()).resolves.toBe(4);
    const [[{ where }]] = prisma.provisionLog.deleteMany.mock.calls;
    const cutoff = (where?.createdAt as { lt: Date }).lt.getTime();
    expect(Date.now() - cutoff).toBeGreaterThan(2 * ROLLING_DAY_MS - 5_000);
  });

  it('describes waits in the nearest useful unit', () => {
    expect(describeWait(1)).toBe('1 second');
    expect(describeWait(45)).toBe('45 seconds');
    expect(describeWait(600)).toBe('10 minutes');
    expect(describeWait(5 * 3600)).toBe('5 hours');
  });
});
