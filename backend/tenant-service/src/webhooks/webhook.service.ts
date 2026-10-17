import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  WEBHOOK_DELIVERY_HEADER,
  WEBHOOK_EVENT_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  type TenantWebhookEvent,
  type TenantWebhookPayload,
} from '@liftoff/shared-types';
import { PrismaService } from '../prisma.service';
import { errorMessage } from '../common/error-message';
import { assertPublicDestination, parseWebhookUrl } from './destination';
import { signWebhookBody } from './signature';
import { withAddress } from '../tenants/address';

export const WEBHOOK_TIMEOUT_MS = 10_000;
// Four attempts: now, then after 1 s, 5 s and 25 s.
export const WEBHOOK_BACKOFF_MS = [1_000, 5_000, 25_000];

export type Fetch = typeof fetch;
export type Sleep = (ms: number) => Promise<void>;

const wait: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  // Replaced in tests; production uses the globals.
  fetchImpl: Fetch = fetch;
  sleep: Sleep = wait;

  constructor(private readonly prisma: PrismaService) {}

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
      include: {
        organisation: {
          select: { webhookUrl: true, webhookSecret: true, baseDomain: true },
        },
      },
    });
    if (!tenant) {
      this.logger.warn(`Webhook ${event}: tenant ${tenantId} is gone`);
      return false;
    }
    const { organisation, ...tenantRow } = tenant;
    if (!organisation?.webhookUrl || !organisation.webhookSecret) {
      return false;
    }

    const url = parseWebhookUrl(organisation.webhookUrl);
    const payload: TenantWebhookPayload = {
      event,
      tenant: withAddress(tenantRow, organisation.baseDomain),
    };
    const body = JSON.stringify(payload);
    const deliveryId = randomUUID();
    const headers = {
      'content-type': 'application/json',
      'user-agent': 'Liftoff-Webhooks/1.0',
      [WEBHOOK_EVENT_HEADER]: event,
      [WEBHOOK_DELIVERY_HEADER]: deliveryId,
      [WEBHOOK_SIGNATURE_HEADER]: signWebhookBody(
        organisation.webhookSecret,
        body,
      ),
    };

    const attempts = WEBHOOK_BACKOFF_MS.length + 1;
    for (let attempt = 1; attempt <= attempts; attempt++) {
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
            `Webhook ${event} for tenant ${tenantId} delivered (${response.status}) on attempt ${attempt}`,
          );
          return true;
        }
        if (response.status >= 400 && response.status < 500) {
          this.logger.warn(
            `Webhook ${event} for tenant ${tenantId} rejected with ${response.status}; not retrying`,
          );
          return false;
        }
        this.logger.warn(
          `Webhook ${event} for tenant ${tenantId} got ${response.status} on attempt ${attempt}/${attempts}`,
        );
      } catch (error) {
        this.logger.warn(
          `Webhook ${event} for tenant ${tenantId} attempt ${attempt}/${attempts} failed: ${errorMessage(error)}`,
        );
      }
      if (attempt < attempts) {
        await this.sleep(WEBHOOK_BACKOFF_MS[attempt - 1]);
      }
    }
    this.logger.error(
      `Webhook ${event} for tenant ${tenantId} gave up after ${attempts} attempts (delivery ${deliveryId})`,
    );
    return false;
  }
}
