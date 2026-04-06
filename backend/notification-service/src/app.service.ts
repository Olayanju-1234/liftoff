import { Injectable, Logger } from '@nestjs/common';
import {
  RabbitSubscribe,
  AmqpConnection,
  Nack,
} from '@golevelup/nestjs-rabbitmq';
import * as sharedTypes from '@liftoff/shared-types';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly amqpConnection: AmqpConnection) { }

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
  public async handleTenantBillingActive(
    payload: sharedTypes.TenantBillingActivePayload,
  ) {
    this.logger.log(`Sending welcome email for tenant ${payload.tenantId} (${payload.subdomain})`);

    try {
      await sleep(500);

      this.logger.log(`Welcome email sent for ${payload.subdomain}`);

      await this.amqpConnection.publish(
        'provisioning.direct',
        'tenant.provisioning.complete',
        {
          tenantId: payload.tenantId,
          subdomain: payload.subdomain,
        },
      );
    } catch (error) {
      this.logger.error(`Failed to send welcome email for tenant ${payload.tenantId}: ${error.message}`);
      return new Nack(false);
    }
  }
}
