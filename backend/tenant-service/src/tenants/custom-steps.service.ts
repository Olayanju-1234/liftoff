import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, StepStatus, type CustomStepCall } from '.prisma/tenant-client';
import {
  CUSTOM_STEP_EVENT,
  type CustomStepAction,
  type CustomStepRequest,
  type ProvisioningStepName,
} from '@liftoff/shared-types';
import { PrismaService } from '../prisma.service';
import { errorMessage } from '../common/error-message';
import { parseWebhookUrl } from '../webhooks/destination';
import {
  WebhookService,
  webhookOrganisationFields,
  type SignedPostResult,
} from '../webhooks/webhook.service';

export const DEFAULT_PUBLIC_API_URL = 'http://localhost:4000';
const OVERDUE_BATCH = 100;

type ClosedStatus =
  | typeof StepStatus.SUCCESS
  | typeof StepStatus.FAILED
  | typeof StepStatus.CANCELLED;

// What the tenant record shows about each custom request: the latest per step and action.
export interface CustomStepView {
  step: string;
  action: string;
  requestId: string;
  status: StepStatus;
  url: string;
  requestedAt: Date;
  deadlineAt: Date;
  completedAt: Date | null;
  error: string | null;
  output: Prisma.JsonValue | null;
}

@Injectable()
export class CustomStepsService {
  private readonly logger = new Logger(CustomStepsService.name);
  private readonly apiUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhookService,
    config: ConfigService,
  ) {
    const configured = config.get<string>('PUBLIC_API_URL')?.trim();
    if (!configured) {
      this.logger.warn(
        `PUBLIC_API_URL is not set: custom step callbacks point at ${DEFAULT_PUBLIC_API_URL}`,
      );
    }
    this.apiUrl = (configured || DEFAULT_PUBLIC_API_URL).replace(/\/+$/, '');
  }

  // The company POSTs <callbackUrl>/complete or <callbackUrl>/fail.
  callbackUrl(
    tenantId: string,
    step: ProvisioningStepName,
    action: CustomStepAction,
  ): string {
    const base = `${this.apiUrl}/tenants/${tenantId}/steps/${step}`;
    return action === 'teardown' ? `${base}/teardown` : base;
  }

  // A new request for the step; an older one still open is superseded, so only the
  // latest can be called back. A retried teardown also retires the one that failed, so
  // the removal is no longer held up by it.
  async open(
    tenantId: string,
    step: ProvisioningStepName,
    action: CustomStepAction,
    target: { url: string; timeoutMs: number },
  ): Promise<CustomStepCall> {
    await this.prisma.customStepCall.updateMany({
      where: { tenantId, step, action, status: StepStatus.IN_PROGRESS },
      data: {
        status: StepStatus.CANCELLED,
        completedAt: new Date(),
        error: 'Superseded by a newer request',
      },
    });
    if (action === 'teardown') {
      await this.prisma.customStepCall.updateMany({
        where: { tenantId, step, action, status: StepStatus.FAILED },
        data: { status: StepStatus.CANCELLED },
      });
    }
    return this.prisma.customStepCall.create({
      data: {
        tenantId,
        step,
        action,
        url: target.url,
        deadlineAt: new Date(Date.now() + target.timeoutMs),
      },
    });
  }

  // POSTs the request, signed with the company's webhook secret. Never throws: the result
  // says whether the company's system took it.
  async send(call: CustomStepCall): Promise<SignedPostResult> {
    const action = call.action as CustomStepAction;
    const event = CUSTOM_STEP_EVENT[action];
    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: call.tenantId },
        include: { organisation: { select: webhookOrganisationFields } },
      });
      if (!tenant) {
        return { delivered: false, error: 'the customer is gone' };
      }
      const { organisation, ...row } = tenant;
      if (!organisation?.webhookSecret) {
        return {
          delivered: false,
          error:
            'there is no webhook secret to sign the request with; set a webhook URL under Settings',
        };
      }
      const payload: CustomStepRequest = {
        event,
        step: call.step as ProvisioningStepName,
        requestId: call.id,
        callbackUrl: this.callbackUrl(
          call.tenantId,
          call.step as ProvisioningStepName,
          action,
        ),
        deadline: call.deadlineAt.toISOString(),
        tenant: this.webhooks.tenantRecord(row, organisation),
      };
      return await this.webhooks.post({
        url: parseWebhookUrl(call.url, 'url'),
        secret: organisation.webhookSecret,
        event,
        body: JSON.stringify(payload),
        label: `${event} ${call.step} for tenant ${call.tenantId}`,
        stillWanted: () => this.isOpen(call.id),
      });
    } catch (error) {
      this.logger.error(
        `${event} ${call.step} for tenant ${call.tenantId} could not be sent: ${errorMessage(error)}`,
      );
      return { delivered: false, error: errorMessage(error) };
    }
  }

  private async isOpen(id: string): Promise<boolean> {
    const call = await this.prisma.customStepCall.findUnique({
      where: { id },
      select: { status: true },
    });
    return call?.status === StepStatus.IN_PROGRESS;
  }

  latest(
    tenantId: string,
    step: ProvisioningStepName,
    action: CustomStepAction,
  ): Promise<CustomStepCall | null> {
    return this.prisma.customStepCall.findFirst({
      where: { tenantId, step, action },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Closes an open request. False when something closed it first: a callback, the
  // deadline, a cancel or a newer request.
  async close(
    id: string,
    status: ClosedStatus,
    detail: { error?: string; output?: Prisma.InputJsonObject } = {},
  ): Promise<boolean> {
    const { count } = await this.prisma.customStepCall.updateMany({
      where: { id, status: StepStatus.IN_PROGRESS },
      data: {
        status,
        completedAt: new Date(),
        ...(detail.error ? { error: detail.error } : {}),
        ...(detail.output ? { output: detail.output } : {}),
      },
    });
    return count > 0;
  }

  // Nothing the company's system says about these requests counts any more.
  async cancelOpen(
    tenantId: string,
    action: CustomStepAction,
    reason: string,
  ): Promise<number> {
    const { count } = await this.prisma.customStepCall.updateMany({
      where: { tenantId, action, status: StepStatus.IN_PROGRESS },
      data: {
        status: StepStatus.CANCELLED,
        completedAt: new Date(),
        error: reason,
      },
    });
    return count;
  }

  // Of these custom steps, the ones whose teardown was never sent, failed or was cut short.
  async teardownsToRetry(
    tenantId: string,
    steps: ProvisioningStepName[],
  ): Promise<ProvisioningStepName[]> {
    const latest = new Map<string, StepStatus>();
    const calls = await this.prisma.customStepCall.findMany({
      where: { tenantId, action: 'teardown' },
      orderBy: { createdAt: 'desc' },
      select: { step: true, status: true },
    });
    for (const call of calls) {
      if (!latest.has(call.step)) {
        latest.set(call.step, call.status);
      }
    }
    return steps.filter((step) => {
      const status = latest.get(step);
      return status !== StepStatus.IN_PROGRESS && status !== StepStatus.SUCCESS;
    });
  }

  overdue(now: Date): Promise<CustomStepCall[]> {
    return this.prisma.customStepCall.findMany({
      where: { status: StepStatus.IN_PROGRESS, deadlineAt: { lt: now } },
      orderBy: { deadlineAt: 'asc' },
      take: OVERDUE_BATCH,
    });
  }

  async forTenant(tenantId: string): Promise<CustomStepView[]> {
    const calls = await this.prisma.customStepCall.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const latest = new Map<string, CustomStepView>();
    for (const call of calls) {
      const key = `${call.action}:${call.step}`;
      if (!latest.has(key)) {
        latest.set(key, {
          step: call.step,
          action: call.action,
          requestId: call.id,
          status: call.status,
          url: call.url,
          requestedAt: call.createdAt,
          deadlineAt: call.deadlineAt,
          completedAt: call.completedAt,
          error: call.error,
          output: call.output,
        });
      }
    }
    return [...latest.values()];
  }
}
