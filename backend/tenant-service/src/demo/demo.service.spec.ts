import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { StepStatus, TenantStatus } from '.prisma/tenant-client';
import { PrismaService } from '../prisma.service';
import { TenantsService } from '../tenants/tenants.service';
import { QuotaExceededException } from '../tenants/quotas.service';
import { StatusTokenService } from '../status/status-token.service';
import {
  DEMO_EXPIRED_REASON,
  DemoService,
  TEARDOWN_GIVE_UP_MS,
  TEARDOWN_RETRY_AFTER_MS,
  demoCustomer,
} from './demo.service';
import { DEMO_ORGANISATION_ID } from './demo.constants';
import { ParseDemoTokenPipe, hashClientIp, hashDemoToken } from './demo-token';

describe('DemoService', () => {
  let service: DemoService;
  let prisma: {
    demoTenant: { findMany: jest.Mock; findUnique: jest.Mock };
    tenant: { count: jest.Mock; findMany: jest.Mock };
    organisation: { upsert: jest.Mock };
  };
  let tenants: { create: jest.Mock; retry: jest.Mock; delete: jest.Mock };

  beforeEach(async () => {
    prisma = {
      demoTenant: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
      tenant: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      organisation: { upsert: jest.fn().mockResolvedValue({}) },
    };
    tenants = {
      create: jest.fn().mockResolvedValue({
        id: 'ct1',
        name: 'Globex Robotics',
        subdomain: 'globexrobotics',
        statusUrl: 'https://app.test/status/tok',
      }),
      retry: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        DemoService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantsService, useValue: tenants },
        {
          provide: StatusTokenService,
          useValue: {
            frontendUrl: 'https://app.test',
            urlFor: (id: string) => `https://app.test/status/tok(${id})`,
          },
        },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => 'j'.repeat(40) },
        },
      ],
    }).compile();
    service = moduleRef.get(DemoService);
  });

  describe('create', () => {
    it('provisions a test tenant in the demo organisation with its token, IP hash and failStep', async () => {
      const created = await service.create({ failStep: 'dns' }, '203.0.113.9');

      const [[dto, creator, demo]] = tenants.create.mock.calls as [
        [
          { name: string; subdomain: string; planId: string; test: boolean },
          object,
          {
            tokenHash: string;
            ipHash: string;
            failStep: string;
            expiresAt: Date;
          },
        ],
      ];
      expect(dto).toMatchObject({ planId: 'pro', test: true });
      expect(dto.subdomain).toMatch(/^[a-z]+$/);
      expect(creator).toEqual({
        organisationId: DEMO_ORGANISATION_ID,
        ownerId: null,
      });
      expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(demo.tokenHash).toBe(hashDemoToken(created.token));
      expect(demo.ipHash).toBe(hashClientIp('j'.repeat(40), '203.0.113.9'));
      expect(demo.ipHash).not.toContain('203.0.113.9');
      expect(demo.failStep).toBe('dns');
      expect(demo.expiresAt.getTime() - Date.now()).toBeGreaterThan(
        14 * 60_000,
      );
      expect(created).toMatchObject({
        liveUrl: `https://app.test/demo/${created.token}`,
        statusUrl: 'https://app.test/status/tok',
        name: 'Globex Robotics',
        failStep: 'dns',
      });
    });

    it('draws another name when one is taken by a live demo', async () => {
      tenants.create.mockRejectedValueOnce(new ConflictException('taken'));

      await service.create({}, '203.0.113.9');

      expect(tenants.create).toHaveBeenCalledTimes(2);
    });

    it('allows five demos per visitor an hour, then answers 429 with when the next frees up', async () => {
      const now = Date.now();
      prisma.demoTenant.findMany.mockResolvedValueOnce(
        [50, 40, 30, 20, 10].map((min) => ({
          createdAt: new Date(now - min * 60_000),
        })),
      );

      const error = await service
        .create({}, '203.0.113.9')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QuotaExceededException);
      // The oldest of the five leaves the hour in about ten minutes.
      expect(
        (error as QuotaExceededException).retryAfterSeconds,
      ).toBeGreaterThan(9 * 60);
      expect(
        (error as QuotaExceededException).retryAfterSeconds,
      ).toBeLessThanOrEqual(10 * 60);
      expect(tenants.create).not.toHaveBeenCalled();
      expect(prisma.demoTenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            ipHash: hashClientIp('j'.repeat(40), '203.0.113.9'),
            createdAt: { gte: expect.any(Date) as Date },
          },
        }),
      );
    });

    it('caps live demo schemas at 20 across everyone', async () => {
      prisma.tenant.count.mockResolvedValueOnce(20);

      const error = await service
        .create({}, '198.51.100.1')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QuotaExceededException);
      expect((error as QuotaExceededException).retryAfterSeconds).toBe(60);
      expect(prisma.tenant.count).toHaveBeenCalledWith({
        where: { organisationId: DEMO_ORGANISATION_ID, live: true },
      });
    });
  });

  describe('view', () => {
    const row = {
      tenantId: 'ct1',
      failStep: 'billing',
      failInjectedAt: new Date('2026-10-23T10:00:02Z'),
      expiresAt: new Date('2026-10-23T10:15:00Z'),
      tenant: {
        id: 'ct1',
        name: 'Globex Robotics',
        subdomain: 'globexrobotics',
        schemaName: 'tenant_liftoff_demo_globexrobotics',
        status: TenantStatus.FAILED,
        planId: 'pro',
        isTest: true,
        dbStatus: StepStatus.SUCCESS,
        dnsStatus: StepStatus.SUCCESS,
        credentialsStatus: StepStatus.SUCCESS,
        billingStatus: StepStatus.FAILED,
        notificationStatus: StepStatus.PENDING,
        teardownDbStatus: null,
        teardownCredentialsStatus: null,
        teardownBillingStatus: null,
        stepModes: { database: 'builtin', junk: 'x' },
        cancelReason: null,
        createdAt: new Date('2026-10-23T10:00:00Z'),
        updatedAt: new Date('2026-10-23T10:00:03Z'),
        deletedAt: null,
        organisation: { baseDomain: 'yoursaas.example', plans: null },
        events: [
          {
            id: 'e1',
            tenantId: 'ct1',
            eventType: 'tenant.created',
            status: 'Success',
            payload: {},
            timestamp: new Date('2026-10-23T10:00:00Z'),
          },
        ],
      },
    };

    it('answers the demo customer with its steps, events and failure', async () => {
      prisma.demoTenant.findUnique.mockResolvedValueOnce(row);

      const view = await service.view('t'.repeat(43));

      expect(prisma.demoTenant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenHash: hashDemoToken('t'.repeat(43)) },
        }),
      );
      expect(view.tenant).toMatchObject({
        id: 'ct1',
        address: 'globexrobotics.yoursaas.example',
        planName: 'Pro',
        billingStatus: 'FAILED',
        stepModes: { database: 'builtin' },
        statusUrl: 'https://app.test/status/tok(ct1)',
        createdAt: '2026-10-23T10:00:00.000Z',
      });
      expect(view.tenant).not.toHaveProperty('organisation');
      expect(view.events).toEqual([
        expect.objectContaining({
          eventType: 'tenant.created',
          timestamp: '2026-10-23T10:00:00.000Z',
        }),
      ]);
      expect(view).toMatchObject({
        failStep: 'billing',
        failInjected: true,
        expiresAt: '2026-10-23T10:15:00.000Z',
      });
    });

    it('never selects billing or owner fields', async () => {
      prisma.demoTenant.findUnique.mockResolvedValueOnce(row);

      await service.view('t'.repeat(43));

      const [[args]] = prisma.demoTenant.findUnique.mock.calls as [
        [{ include: { tenant: { select: Record<string, unknown> } } }],
      ];
      const selected = Object.keys(args.include.tenant.select);
      for (const field of [
        'stripeCustomerId',
        'stripeSubscriptionId',
        'ownerId',
        'statusTokenHash',
      ]) {
        expect(selected).not.toContain(field);
      }
    });

    it('answers 404 for an unknown token', async () => {
      prisma.demoTenant.findUnique.mockResolvedValueOnce(null);

      await expect(service.view('u'.repeat(43))).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('retry', () => {
    it('runs the same retry as the dashboard, in the demo organisation', async () => {
      prisma.demoTenant.findUnique.mockResolvedValueOnce({ tenantId: 'ct1' });
      const view = jest
        .spyOn(service, 'view')
        .mockResolvedValueOnce({} as never);

      await service.retry('t'.repeat(43));

      expect(tenants.retry).toHaveBeenCalledWith('ct1', DEMO_ORGANISATION_ID);
      expect(view).toHaveBeenCalledWith('t'.repeat(43));
    });

    it('answers 404 for an unknown token without retrying anything', async () => {
      prisma.demoTenant.findUnique.mockResolvedValueOnce(null);

      await expect(service.retry('u'.repeat(43))).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(tenants.retry).not.toHaveBeenCalled();
    });
  });

  describe('removeExpired', () => {
    it('removes expired demos through the deprovisioning saga', async () => {
      prisma.tenant.findMany.mockResolvedValueOnce([
        { id: 'ct1' },
        { id: 'ct2' },
      ]);

      await expect(service.removeExpired()).resolves.toBe(2);

      expect(tenants.delete).toHaveBeenCalledWith(
        'ct1',
        DEMO_ORGANISATION_ID,
        DEMO_EXPIRED_REASON,
      );
      expect(tenants.delete).toHaveBeenCalledWith(
        'ct2',
        DEMO_ORGANISATION_ID,
        DEMO_EXPIRED_REASON,
      );
    });

    it('picks expired demos still holding a schema: not removed yet, or a teardown that never finished', async () => {
      const before = Date.now();
      await service.removeExpired();

      const [[{ where }]] = prisma.tenant.findMany.mock.calls as [
        [
          {
            where: {
              organisationId: string;
              live: boolean;
              demo: { expiresAt: { lt: Date } };
              OR: [object, { deletedAt: { lt: Date; gt: Date } }];
            };
          },
        ],
      ];
      expect(where.organisationId).toBe(DEMO_ORGANISATION_ID);
      expect(where.live).toBe(true);
      expect(where.demo.expiresAt.lt.getTime()).toBeGreaterThanOrEqual(before);
      expect(where.OR[0]).toEqual({ status: { not: TenantStatus.DELETED } });
      expect(
        before - where.OR[1].deletedAt.lt.getTime(),
      ).toBeGreaterThanOrEqual(TEARDOWN_RETRY_AFTER_MS - 1000);
      expect(
        before - where.OR[1].deletedAt.gt.getTime(),
      ).toBeGreaterThanOrEqual(TEARDOWN_GIVE_UP_MS - 1000);
    });

    it('keeps going when one removal fails', async () => {
      prisma.tenant.findMany.mockResolvedValueOnce([
        { id: 'ct1' },
        { id: 'ct2' },
      ]);
      tenants.delete.mockRejectedValueOnce(new Error('broker down'));

      await expect(service.removeExpired()).resolves.toBe(1);
    });
  });

  it('creates the demo organisation on boot if it is missing, never changing an existing one', async () => {
    await service.onModuleInit();

    expect(prisma.organisation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DEMO_ORGANISATION_ID },
        update: {},
        create: expect.objectContaining({ handle: 'liftoff-demo' }) as object,
      }),
    );
  });
});

describe('demoCustomer', () => {
  it('pairs a company and a kind, with a letters-only subdomain', () => {
    expect(demoCustomer(() => 1)).toEqual({
      name: 'Globex Cloud',
      subdomain: 'globexcloud',
    });
  });
});

describe('ParseDemoTokenPipe', () => {
  const pipe = new ParseDemoTokenPipe();

  it('passes a 43-character base64url token', () => {
    const token = `${'a'.repeat(41)}_-`;
    expect(pipe.transform(token)).toBe(token);
  });

  it.each(['', 'short', 'a'.repeat(44), `${'a'.repeat(42)}/`])(
    'answers 404 for %p',
    (bad) => {
      expect(() => pipe.transform(bad)).toThrow(NotFoundException);
    },
  );
});
