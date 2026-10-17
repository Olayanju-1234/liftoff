import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { Prisma, StepStatus, TenantStatus } from '.prisma/tenant-client';
import { TenantsService } from './tenants.service';
import { CustomStepsService } from './custom-steps.service';
import { errorMessage } from '../common/error-message';
import type { ProvisioningStep } from './dead-letters';

// Steps in saga order; the first one IN_PROGRESS is the one that is stuck.
export const STEPS_IN_ORDER: ProvisioningStep[] = [
  'dbStatus',
  'dnsStatus',
  'credentialsStatus',
  'billingStatus',
  'notificationStatus',
];

export const STEP_TIMEOUT_MINUTES = 2;
export const SWEEP_TIMEOUT_MINUTES = 30;

// A tenant waiting on the company's system has its own deadline (the step's timeoutMs),
// so neither the 2-minute step timeout nor the 30-minute sweeper touches it.
const NOT_WAITING_ON_COMPANY: Prisma.TenantWhereInput = {
  customStepCalls: {
    none: { action: 'provision', status: StepStatus.IN_PROGRESS },
  },
};

@Injectable()
export class ProvisioningTimeoutService {
  private readonly logger = new Logger(ProvisioningTimeoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantsService: TenantsService,
    private readonly customSteps: CustomStepsService,
  ) {}

  // A step with no progress for two minutes is failed with a reason, which fires the
  // same handling as a dead letter: FAILED status, an Error event, the tenant.failed webhook.
  @Cron(CronExpression.EVERY_MINUTE)
  async handleStepTimeouts(): Promise<number> {
    const threshold = new Date(Date.now() - STEP_TIMEOUT_MINUTES * 60_000);
    let failed = 0;
    try {
      const stuck = await this.prisma.tenant.findMany({
        where: {
          status: TenantStatus.PROVISIONING,
          updatedAt: { lt: threshold },
          ...NOT_WAITING_ON_COMPANY,
          OR: STEPS_IN_ORDER.map(
            (step) =>
              ({ [step]: StepStatus.IN_PROGRESS }) as Prisma.TenantWhereInput,
          ),
        },
        orderBy: { updatedAt: 'asc' },
      });

      for (const tenant of stuck) {
        const step = STEPS_IN_ORDER.find(
          (s) => tenant[s] === StepStatus.IN_PROGRESS,
        );
        if (!step) {
          continue;
        }
        try {
          const done = await this.tenantsService.failStep(
            tenant.id,
            step,
            `Step timed out: no progress at ${step} for ${STEP_TIMEOUT_MINUTES} minutes`,
            { timedOutAfterMinutes: STEP_TIMEOUT_MINUTES },
          );
          if (done) {
            failed++;
            this.logger.warn(
              `Timed out tenant ${tenant.id} (${tenant.subdomain}) at ${step}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to time out tenant ${tenant.id} at ${step}: ${errorMessage(error)}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Error checking for timed-out steps: ${errorMessage(error)}`,
      );
    }
    return failed;
  }

  // A custom step whose deadline passed without a callback fails like a dead letter.
  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleCustomStepTimeouts(): Promise<number> {
    let failed = 0;
    try {
      const overdue = await this.customSteps.overdue(new Date());
      for (const call of overdue) {
        try {
          if (await this.tenantsService.timeOutCustomStep(call)) {
            failed++;
            this.logger.warn(
              `Timed out custom ${call.action} ${call.step} for tenant ${call.tenantId}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to time out custom ${call.step} for tenant ${call.tenantId}: ${errorMessage(error)}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Error checking for overdue custom steps: ${errorMessage(error)}`,
      );
    }
    return failed;
  }

  // Backstop for anything the step timeout cannot see (no step IN_PROGRESS at all):
  // a tenant PROVISIONING with no change for 30 minutes is cancelled.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleProvisioningTimeout() {
    this.logger.log('Checking for stale provisioning pipelines...');

    const timeoutThreshold = new Date(
      Date.now() - SWEEP_TIMEOUT_MINUTES * 60_000,
    );

    try {
      const staleTenants = await this.prisma.tenant.findMany({
        where: {
          status: TenantStatus.PROVISIONING,
          updatedAt: {
            lt: timeoutThreshold,
          },
          ...NOT_WAITING_ON_COMPANY,
        },
      });

      if (staleTenants.length === 0) {
        this.logger.log('No stale pipelines found.');
        return;
      }

      this.logger.warn(
        `Found ${staleTenants.length} stale pipeline(s). Auto-cancelling...`,
      );

      for (const tenant of staleTenants) {
        try {
          await this.tenantsService.cancelStale(
            tenant.id,
            `Provisioning timeout - no progress for ${SWEEP_TIMEOUT_MINUTES} minutes`,
          );
          this.logger.log(
            `Auto-cancelled tenant ${tenant.id} (${tenant.subdomain})`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to auto-cancel tenant ${tenant.id}: ${errorMessage(error)}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Error checking for stale pipelines: ${errorMessage(error)}`,
      );
    }
  }
}
