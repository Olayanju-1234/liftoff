import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RabbitSubscribe,
  AmqpConnection,
  Nack,
} from '@golevelup/nestjs-rabbitmq';
import type {
  NotificationOutcome,
  NotificationSkipReason,
  ProvisioningCompletePayload,
  TenantBillingActivePayload,
  TenantFailedPayload,
} from '@liftoff/shared-types';
import { EmailService } from './email.service';
import { InternalApiClient } from './internal-api.client';
import { attentionEmail, readyEmail } from './templates';

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private readonly frontendUrl: string;

  constructor(
    private readonly amqpConnection: AmqpConnection,
    private readonly email: EmailService,
    private readonly internalApi: InternalApiClient,
    config: ConfigService,
  ) {
    this.frontendUrl = (
      config.get<string>('FRONTEND_URL') || 'http://localhost:5173'
    ).replace(/\/+$/, '');
  }

  // The last provisioning step: tell the company its customer is ready. The customer's own
  // welcome is the company's job, from the tenant.active webhook.
  @RabbitSubscribe({
    exchange: 'provisioning.direct',
    routingKey: 'tenant.billing.active',
    queue: 'notification-queue',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'dlx.provisioning',
      deadLetterRoutingKey: 'notification.failed',
    },
  })
  public async handleTenantBillingActive(payload: TenantBillingActivePayload) {
    let outcome: NotificationOutcome;
    try {
      outcome = await this.notifyReady(payload.tenantId);
    } catch (error) {
      // Email or tenant-service failed: dead-letter, so the step reads FAILED and can be retried.
      this.logger.error(
        `Could not tell the company that tenant ${payload.tenantId} is ready: ${errorMessage(error)}`,
      );
      return new Nack(false);
    }

    const complete: ProvisioningCompletePayload = {
      tenantId: payload.tenantId,
      subdomain: payload.subdomain,
      notification: outcome,
    };
    try {
      await this.amqpConnection.publish(
        'provisioning.direct',
        'tenant.provisioning.complete',
        complete,
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish provisioning.complete for tenant ${payload.tenantId}: ${errorMessage(error)}`,
      );
      return new Nack(false);
    }
  }

  // Failures are emailed from their own queue with no dead-letter exchange: a mail problem
  // here must not mark anything else on a tenant that already reads FAILED.
  @RabbitSubscribe({
    exchange: 'provisioning.direct',
    routingKey: 'tenant.failed',
    queue: 'notification-failed-queue',
    queueOptions: { durable: true },
  })
  public async handleTenantFailed(payload: TenantFailedPayload) {
    const skip = this.skipReason();
    if (skip) {
      this.logger.warn(
        `Not emailing the company about failed tenant ${payload.tenantId}: ${skip}`,
      );
      return;
    }
    try {
      const details = await this.internalApi.notificationDetails(
        payload.tenantId,
      );
      const to = details.recipients.attention;
      if (to.length === 0) {
        this.logger.warn(
          `Nobody to email about failed tenant ${payload.tenantId}: no verified user with failed-job alerts on`,
        );
        return;
      }
      await this.email.send({
        to,
        ...attentionEmail(
          details,
          payload.step,
          payload.error,
          this.frontendUrl,
        ),
      });
      this.logger.log(
        `Emailed ${to.length} recipient(s): ${details.tenant.name} needs attention at ${payload.step}`,
      );
    } catch (error) {
      this.logger.error(
        `Could not email the company about failed tenant ${payload.tenantId}: ${errorMessage(error)}`,
      );
      return new Nack(false);
    }
  }

  private async notifyReady(tenantId: string): Promise<NotificationOutcome> {
    const skip = this.skipReason();
    if (skip) {
      this.logger.warn(`Notification for tenant ${tenantId} skipped: ${skip}`);
      return { sent: false, recipients: 0, skipReason: skip };
    }
    const details = await this.internalApi.notificationDetails(tenantId);
    const to = details.recipients.ready;
    if (to.length === 0) {
      this.logger.warn(
        `Notification for tenant ${tenantId} skipped: no verified user with notifications on`,
      );
      return { sent: false, recipients: 0, skipReason: 'no-recipient' };
    }
    await this.email.send({ to, ...readyEmail(details, this.frontendUrl) });
    this.logger.log(
      `Emailed ${to.length} recipient(s): ${details.tenant.name} is ready`,
    );
    return { sent: true, recipients: to.length };
  }

  private skipReason(): NotificationSkipReason | undefined {
    if (!this.email.enabled) {
      return 'no-provider';
    }
    if (!this.internalApi.configured) {
      return 'not-configured';
    }
    return undefined;
  }
}
