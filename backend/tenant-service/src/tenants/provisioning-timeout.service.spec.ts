import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, StepStatus, TenantStatus } from '.prisma/tenant-client';

import {
  ProvisioningTimeoutService,
  STEP_TIMEOUT_MINUTES,
} from './provisioning-timeout.service';
import { TenantsService } from './tenants.service';
import { CustomStepsService } from './custom-steps.service';
import { PrismaService } from '../prisma.service';

type MockPrisma = {
  tenant: {
    findMany: jest.Mock<Promise<unknown[]>, [Prisma.TenantFindManyArgs]>;
  };
};

const steps = {
  dbStatus: StepStatus.SUCCESS,
  dnsStatus: StepStatus.SUCCESS,
  credentialsStatus: StepStatus.IN_PROGRESS,
  billingStatus: StepStatus.PENDING,
  notificationStatus: StepStatus.PENDING,
};

describe('ProvisioningTimeoutService', () => {
  let service: ProvisioningTimeoutService;
  let prisma: MockPrisma;
  let tenants: {
    failStep: jest.Mock;
    cancelStale: jest.Mock;
    timeOutCustomStep: jest.Mock;
  };
  let customSteps: { overdue: jest.Mock };

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma = {
      tenant: {
        findMany: jest
          .fn<Promise<unknown[]>, [Prisma.TenantFindManyArgs]>()
          .mockResolvedValue([]),
      },
    };
    tenants = {
      failStep: jest.fn().mockResolvedValue(true),
      cancelStale: jest.fn().mockResolvedValue({}),
      timeOutCustomStep: jest.fn().mockResolvedValue(true),
    };
    customSteps = { overdue: jest.fn().mockResolvedValue([]) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProvisioningTimeoutService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantsService, useValue: tenants },
        { provide: CustomStepsService, useValue: customSteps },
      ],
    }).compile();
    service = moduleRef.get(ProvisioningTimeoutService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('step timeout', () => {
    it('looks for PROVISIONING tenants with a step IN_PROGRESS and no change for 2 minutes', async () => {
      await service.handleStepTimeouts();

      const [[args]] = prisma.tenant.findMany.mock.calls;
      expect(args.where?.status).toBe(TenantStatus.PROVISIONING);
      const threshold = (args.where?.updatedAt as { lt: Date }).lt.getTime();
      expect(Date.now() - threshold).toBeGreaterThan(
        STEP_TIMEOUT_MINUTES * 60_000 - 5_000,
      );
      expect(args.where?.OR).toEqual([
        { dbStatus: StepStatus.IN_PROGRESS },
        { dnsStatus: StepStatus.IN_PROGRESS },
        { credentialsStatus: StepStatus.IN_PROGRESS },
        { billingStatus: StepStatus.IN_PROGRESS },
        { notificationStatus: StepStatus.IN_PROGRESS },
      ]);
    });

    it('fails the stuck step with a "timed out" reason, which drives the usual failed handling', async () => {
      prisma.tenant.findMany.mockResolvedValueOnce([
        { id: 't1', subdomain: 'globex', ...steps },
      ]);

      await expect(service.handleStepTimeouts()).resolves.toBe(1);

      expect(tenants.failStep).toHaveBeenCalledWith(
        't1',
        'credentialsStatus',
        'Step timed out: no progress at credentialsStatus for 2 minutes',
        { timedOutAfterMinutes: 2 },
      );
    });

    it('picks the earliest IN_PROGRESS step and skips rows with none', async () => {
      prisma.tenant.findMany.mockResolvedValueOnce([
        {
          id: 't1',
          subdomain: 'a',
          ...steps,
          dbStatus: StepStatus.IN_PROGRESS,
        },
        {
          id: 't2',
          subdomain: 'b',
          ...steps,
          credentialsStatus: StepStatus.PENDING,
        },
      ]);

      await expect(service.handleStepTimeouts()).resolves.toBe(1);

      expect(tenants.failStep).toHaveBeenCalledTimes(1);
      expect(tenants.failStep).toHaveBeenCalledWith(
        't1',
        'dbStatus',
        expect.stringContaining('timed out'),
        expect.anything(),
      );
    });

    it('does not count a tenant that moved on between the read and the write', async () => {
      prisma.tenant.findMany.mockResolvedValueOnce([
        { id: 't1', subdomain: 'globex', ...steps },
      ]);
      tenants.failStep.mockResolvedValueOnce(false);

      await expect(service.handleStepTimeouts()).resolves.toBe(0);
    });

    it('keeps going when one tenant cannot be failed', async () => {
      prisma.tenant.findMany.mockResolvedValueOnce([
        { id: 't1', subdomain: 'a', ...steps },
        { id: 't2', subdomain: 'b', ...steps },
      ]);
      tenants.failStep.mockRejectedValueOnce(new Error('db gone'));

      await expect(service.handleStepTimeouts()).resolves.toBe(1);
      expect(tenants.failStep).toHaveBeenCalledTimes(2);
    });

    it('survives a failed query', async () => {
      prisma.tenant.findMany.mockRejectedValueOnce(new Error('db gone'));
      await expect(service.handleStepTimeouts()).resolves.toBe(0);
    });
  });

  describe('30-minute sweeper (backstop)', () => {
    it('cancels anything still PROVISIONING after 30 minutes, whatever its steps say', async () => {
      prisma.tenant.findMany.mockResolvedValueOnce([
        { id: 't1', subdomain: 'globex' },
      ]);

      await service.handleProvisioningTimeout();

      const [[args]] = prisma.tenant.findMany.mock.calls;
      expect(args.where?.OR).toBeUndefined();
      const threshold = (args.where?.updatedAt as { lt: Date }).lt.getTime();
      expect(Date.now() - threshold).toBeGreaterThan(30 * 60_000 - 5_000);
      expect(tenants.cancelStale).toHaveBeenCalledWith(
        't1',
        'Provisioning timeout - no progress for 30 minutes',
      );
    });
  });

  describe('custom steps', () => {
    const waitingOnCompany = {
      customStepCalls: {
        none: { action: 'provision', status: StepStatus.IN_PROGRESS },
      },
    };

    it('leaves a tenant waiting on the company to its own deadline, not the 2-minute timeout', async () => {
      await service.handleStepTimeouts();

      const [[args]] = prisma.tenant.findMany.mock.calls;
      expect(args.where).toMatchObject(waitingOnCompany);
    });

    it('never sweeps a tenant that is waiting on the company, however long its timeout', async () => {
      await service.handleProvisioningTimeout();

      const [[args]] = prisma.tenant.findMany.mock.calls;
      expect(args.where).toMatchObject(waitingOnCompany);
    });

    it('fails every request whose deadline passed and counts those it failed', async () => {
      const calls = [
        { id: 'call-1', tenantId: 't1', step: 'database', action: 'provision' },
        { id: 'call-2', tenantId: 't2', step: 'billing', action: 'provision' },
      ];
      customSteps.overdue.mockResolvedValueOnce(calls);
      // The second was called back between the read and the write.
      tenants.timeOutCustomStep
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await expect(service.handleCustomStepTimeouts()).resolves.toBe(1);

      const [[now]] = customSteps.overdue.mock.calls as [[Date]];
      expect(Math.abs(now.getTime() - Date.now())).toBeLessThan(5_000);
      expect(tenants.timeOutCustomStep).toHaveBeenCalledWith(calls[0]);
      expect(tenants.timeOutCustomStep).toHaveBeenCalledWith(calls[1]);
    });

    it('keeps going when one request cannot be timed out, and survives a failed query', async () => {
      customSteps.overdue.mockResolvedValueOnce([
        { id: 'call-1', tenantId: 't1', step: 'address', action: 'provision' },
        { id: 'call-2', tenantId: 't2', step: 'address', action: 'provision' },
      ]);
      tenants.timeOutCustomStep
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValueOnce(true);

      await expect(service.handleCustomStepTimeouts()).resolves.toBe(1);

      customSteps.overdue.mockRejectedValueOnce(new Error('db down'));
      await expect(service.handleCustomStepTimeouts()).resolves.toBe(0);
    });
  });
});
