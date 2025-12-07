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
    routingKey: 'tenant.credentials.ready',
    queue: 'billing-queue',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'dlx.provisioning',
      deadLetterRoutingKey: 'billing.failed',
    },
  })
  public async handleTenantCredentialsReady(
    payload: sharedTypes.TenantCredentialsReadyPayload,
  ) {
    console.log(
      `RECEIVED EVENT: Mock creating Stripe subscription for ${payload.tenantId}`,
    );

    try {
      await sleep(1000);

      const subscriptionId = `sub_${Math.random().toString(36).substr(2, 9)}`;

      console.log(
        `SUCCESS: Created Stripe subscription ${subscriptionId} for plan ${payload.planId}`,
      );

      await this.amqpConnection.publish(
        'provisioning.direct',
        'tenant.billing.active',
        {
          tenantId: payload.tenantId,
          subdomain: payload.subdomain,
          planId: payload.planId,
        },
      );
    } catch (error) {
      console.error(
        `FAILED to create subscription for ${payload.tenantId}:`,
        error.message,
      );
      return new Nack(false);
    }
  }
}