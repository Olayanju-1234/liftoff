import { Injectable } from '@nestjs/common';
import {
  RabbitSubscribe,
  AmqpConnection,
  Nack,
} from '@golevelup/nestjs-rabbitmq';
import * as sharedTypes from '@liftoff/shared-types';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

@Injectable()
export class AppService {
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
    console.log(
      `RECEIVED EVENT: Mock sending welcome email for ${payload.subdomain}`,
    );

    try {
      await sleep(500);

      console.log(
        `SUCCESS: Welcome email sent for ${payload.subdomain}`,
      );

      await this.amqpConnection.publish(
        'provisioning.direct',
        'tenant.provisioning.complete',
        {
          tenantId: payload.tenantId,
          subdomain: payload.subdomain,
        },
      );
    } catch (error) {
      console.error(
        `FAILED to send welcome email for ${payload.tenantId}:`,
        error.message,
      );
      return new Nack(false);
    }
  }
}