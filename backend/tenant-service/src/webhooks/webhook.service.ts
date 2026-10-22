import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  WEBHOOK_DELIVERY_HEADER,
  WEBHOOK_EVENT_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  type TenantWebhookEvent,
  type TenantWebhookPayload,
} from '@liftoff/shared-types';
import type { Prisma } from '.prisma/tenant-client';
import { PrismaService } from '../prisma.service';
import { errorMessage } from '../common/error-message';
import { assertPublicDestination, parseWebhookUrl } from './destination';
import { signWebhookBody } from './signature';
import { withAddress } from '../tenants/address';
import { StatusTokenService } from '../status/status-token.service';
import { effectivePlans, planNameFor } from '../organisations/customer-plans';
import { DurableService } from '../durable/durable.service';
import {
  ACTIVITY,
  TENANT_WEBHOOK_WORKFLOW,
  tenantWebhookWorkflowId,
  type DeliveryOutcome,
  type TenantWebhookInput,
} from '../durable/workflows';

export const WEBHOOK_TIMEOUT_MS = 10_000;
// Four attempts: now, then after 1 s, 5 s and 25 s.
export const WEBHOOK_BACKOFF_MS = [1_000, 5_000, 25_000];

export type Fetch = typeof fetch;
export type Sleep = (ms: number) => Promise<void>;

const wait: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const webhookOrganisationFields = {
  webhookUrl: true,
  webhookSecret: true,
  baseDomain: true,
  plans: true,
} satisfies Prisma.OrganisationSelect;

export interface SignedPost {
  url: URL;
  secret: string;
  event: string;
  body: string;
  // Names the delivery in log lines, e.g. "Webhook tenant.active for tenant t1".
  label: string;
  // Asked before each retry; false stops retrying because the answer no longer matters.
  stillWanted?: () => Promise<boolean>;
}

// One attempt. A retryable failure (no answer, a timeout, a 5xx) is worth trying again.
export interface SignedAttemptResult {
  delivered: boolean;
  retryable: boolean;
  status?: number;
  error?: string;
}

export interface SignedPostResult {
  delivered: boolean;
  // The last HTTP status the receiver answered with, if it answered at all.
  status?: number;
  // Why the last attempt failed.
  error?: string;
  // stillWanted() said to stop.
  abandoned?: boolean;
}

@Injectable()
export class WebhookService implements OnModuleInit {
  private readonly logger = new Logger(WebhookService.name);
  // Replaced in tests; production uses the globals.
  fetchImpl: Fetch = fetch;
  sleep: Sleep = wait;

  constructor(
    private readonly prisma: PrismaService,
    private readonly statusTokens: StatusTokenService,
    @Optional() private readonly durable?: DurableService,
  ) {}

  onModuleInit(): void {
    this.durable?.activity(ACTIVITY.deliverWebhook, (input) =>
      this.deliverAttempt(input as TenantWebhookInput),
    );
  }

  // Fire and forget: the saga handler that calls this never waits on a customer's server.
  // With workflowd the retries are durable; otherwise they live in this process.
  notify(tenantId: string, event: TenantWebhookEvent): void {
    if (this.durable?.enabled) {
      const deliveryId = randomUUID();
      const input: TenantWebhookInput = { tenantId, event, deliveryId };
      void this.durable
        .start(
          TENANT_WEBHOOK_WORKFLOW,
          input,
          tenantWebhookWorkflowId(deliveryId),
        )
        .then((started) =>
          started ? undefined : this.deliverInBackground(tenantId, event),
        );
      return;
    }
    this.deliverInBackground(tenantId, event);
  }

  private deliverInBackground(
    tenantId: string,
    event: TenantWebhookEvent,
  ): void {
    this.deliver(tenantId, event).catch((error: unknown) =>
      this.logger.error(
        `Webhook ${event} for tenant ${tenantId} failed: ${errorMessage(error)}`,
      ),
    );
  }

  async deliver(tenantId: string, event: TenantWebhookEvent): Promise<boolean> {
    const request = await this.webhookRequest(tenantId, event);
    if (!request) {
      return false;
    }
    const result = await this.post(request);
    return result.delivered;
  }

  // One durable attempt, run by workflowd. Throws when the attempt is worth retrying.
  async deliverAttempt(input: TenantWebhookInput): Promise<DeliveryOutcome> {
    const request = await this.webhookRequest(input.tenantId, input.event);
    if (!request) {
      return { delivered: false, skipped: true };
    }
    return settle(await this.attemptOnce(request, input.deliveryId, 'durable'));
  }

  private async webhookRequest(
    tenantId: string,
    event: TenantWebhookEvent,
  ): Promise<SignedPost | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { organisation: { select: webhookOrganisationFields } },
    });
    if (!tenant) {
      this.logger.warn(`Webhook ${event}: tenant ${tenantId} is gone`);
      return null;
    }
    const { organisation, ...tenantRow } = tenant;
    if (!organisation?.webhookUrl || !organisation.webhookSecret) {
      return null;
    }

    const payload: TenantWebhookPayload = {
      event,
      tenant: this.tenantRecord(tenantRow, organisation),
    };
    return {
      url: parseWebhookUrl(organisation.webhookUrl),
      secret: organisation.webhookSecret,
      event,
      body: JSON.stringify(payload),
      label: `Webhook ${event} for tenant ${tenantId}`,
    };
  }

  // The same record the API returns, status page link included, so the company can
  // hand it to its customer from the webhook alone.
  tenantRecord<T extends { id: string; subdomain: string; planId: string }>(
    tenant: T,
    organisation: { baseDomain: string | null; plans: Prisma.JsonValue },
  ) {
    return {
      ...withAddress(tenant, organisation.baseDomain),
      statusUrl: this.statusTokens.urlFor(tenant.id),
      planName: planNameFor(effectivePlans(organisation.plans), tenant.planId),
    };
  }

  // A signed POST with retries; webhooks and custom step requests both go through here.
  async post(request: SignedPost): Promise<SignedPostResult> {
    const deliveryId = randomUUID();
    const attempts = WEBHOOK_BACKOFF_MS.length + 1;
    let last: Omit<SignedPostResult, 'delivered'> = {};
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (
        attempt > 1 &&
        request.stillWanted &&
        !(await request.stillWanted())
      ) {
        this.logger.log(`${request.label} no longer needed; stopped retrying`);
        return { delivered: false, abandoned: true };
      }
      const result = await this.attemptOnce(
        request,
        deliveryId,
        `${attempt}/${attempts}`,
      );
      if (result.delivered || !result.retryable) {
        return {
          delivered: result.delivered,
          status: result.status,
          ...(result.error ? { error: result.error } : {}),
        };
      }
      last = { status: result.status, error: result.error };
      if (attempt < attempts) {
        await this.sleep(WEBHOOK_BACKOFF_MS[attempt - 1]);
      }
    }
    this.logger.error(
      `${request.label} gave up after ${attempts} attempts (delivery ${deliveryId})`,
    );
    return { delivered: false, ...last };
  }

  // One signed POST. The delivery id is the same on every attempt, so the receiver can
  // drop a repeat.
  async attemptOnce(
    request: SignedPost,
    deliveryId: string,
    attempt: string,
  ): Promise<SignedAttemptResult> {
    const { url, secret, event, body, label } = request;
    const headers = {
      'content-type': 'application/json',
      'user-agent': 'Liftoff-Webhooks/1.0',
      [WEBHOOK_EVENT_HEADER]: event,
      [WEBHOOK_DELIVERY_HEADER]: deliveryId,
      [WEBHOOK_SIGNATURE_HEADER]: signWebhookBody(secret, body),
    };
    try {
      await assertPublicDestination(url);
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body,
        // A redirect could point anywhere, including inside; treat it as a failure.
        redirect: 'manual',
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      if (response.ok) {
        this.logger.log(
          `${label} delivered (${response.status}) on attempt ${attempt}`,
        );
        return { delivered: true, retryable: false, status: response.status };
      }
      if (response.status >= 400 && response.status < 500) {
        this.logger.warn(
          `${label} rejected with ${response.status}; not retrying`,
        );
        return {
          delivered: false,
          retryable: false,
          status: response.status,
          error: `rejected with ${response.status}`,
        };
      }
      this.logger.warn(`${label} got ${response.status} on attempt ${attempt}`);
      return {
        delivered: false,
        retryable: true,
        status: response.status,
        error: `answered ${response.status}`,
      };
    } catch (error) {
      this.logger.warn(
        `${label} attempt ${attempt} failed: ${errorMessage(error)}`,
      );
      return { delivered: false, retryable: true, error: errorMessage(error) };
    }
  }
}

// Turns an attempt into a settled outcome for workflowd, or throws so the engine retries.
export function settle(result: SignedAttemptResult): DeliveryOutcome {
  if (result.retryable) {
    throw new Error(result.error ?? 'no answer');
  }
  return {
    delivered: result.delivered,
    ...(result.status !== undefined ? { status: result.status } : {}),
    ...(result.error ? { error: result.error } : {}),
  };
}
