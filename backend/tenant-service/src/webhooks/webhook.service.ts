import { Injectable, Logger } from '@nestjs/common';
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
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  // Replaced in tests; production uses the globals.
  fetchImpl: Fetch = fetch;
  sleep: Sleep = wait;

  constructor(
    private readonly prisma: PrismaService,
    private readonly statusTokens: StatusTokenService,
  ) {}

  // Fire and forget: the saga handler that calls this never waits on a customer's server.
  notify(tenantId: string, event: TenantWebhookEvent): void {
    this.deliver(tenantId, event).catch((error: unknown) =>
      this.logger.error(
        `Webhook ${event} for tenant ${tenantId} failed: ${errorMessage(error)}`,
      ),
    );
  }

  async deliver(tenantId: string, event: TenantWebhookEvent): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { organisation: { select: webhookOrganisationFields } },
    });
    if (!tenant) {
      this.logger.warn(`Webhook ${event}: tenant ${tenantId} is gone`);
      return false;
    }
    const { organisation, ...tenantRow } = tenant;
    if (!organisation?.webhookUrl || !organisation.webhookSecret) {
      return false;
    }

    const payload: TenantWebhookPayload = {
      event,
      tenant: this.tenantRecord(tenantRow, organisation),
    };
    const result = await this.post({
      url: parseWebhookUrl(organisation.webhookUrl),
      secret: organisation.webhookSecret,
      event,
      body: JSON.stringify(payload),
      label: `Webhook ${event} for tenant ${tenantId}`,
    });
    return result.delivered;
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
    const { url, secret, event, body, label } = request;
    const deliveryId = randomUUID();
    const headers = {
      'content-type': 'application/json',
      'user-agent': 'Liftoff-Webhooks/1.0',
      [WEBHOOK_EVENT_HEADER]: event,
      [WEBHOOK_DELIVERY_HEADER]: deliveryId,
      [WEBHOOK_SIGNATURE_HEADER]: signWebhookBody(secret, body),
    };

    const attempts = WEBHOOK_BACKOFF_MS.length + 1;
    let last: Omit<SignedPostResult, 'delivered'> = {};
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (
        attempt > 1 &&
        request.stillWanted &&
        !(await request.stillWanted())
      ) {
        this.logger.log(`${label} no longer needed; stopped retrying`);
        return { delivered: false, abandoned: true };
      }
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
          return { delivered: true, status: response.status };
        }
        if (response.status >= 400 && response.status < 500) {
          this.logger.warn(
            `${label} rejected with ${response.status}; not retrying`,
          );
          return {
            delivered: false,
            status: response.status,
            error: `rejected with ${response.status}`,
          };
        }
        last = {
          status: response.status,
          error: `answered ${response.status}`,
        };
        this.logger.warn(
          `${label} got ${response.status} on attempt ${attempt}/${attempts}`,
        );
      } catch (error) {
        last = { error: errorMessage(error) };
        this.logger.warn(
          `${label} attempt ${attempt}/${attempts} failed: ${errorMessage(error)}`,
        );
      }
      if (attempt < attempts) {
        await this.sleep(WEBHOOK_BACKOFF_MS[attempt - 1]);
      }
    }
    this.logger.error(
      `${label} gave up after ${attempts} attempts (delivery ${deliveryId})`,
    );
    return { delivered: false, ...last };
  }
}
