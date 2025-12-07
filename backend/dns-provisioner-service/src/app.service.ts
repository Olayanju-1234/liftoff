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
    routingKey: 'tenant.db.ready',
    queue: 'dns-provisioner-queue',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'dlx.provisioning',
      deadLetterRoutingKey: 'dns-provisioner.failed',
    },
  })
  public async handleTenantDbReady(payload: sharedTypes.TenantDbReadyPayload) {
    console.log(
      `RECEIVED EVENT: Mock creating DNS record for ${payload.subdomain}`,
    );

    try {
      await sleep(2000);

      console.log(
        `SUCCESS: Mock created DNS record for ${payload.subdomain}`,
      );

      await this.amqpConnection.publish(
        'provisioning.direct',
        'tenant.dns.ready',
        {
          tenantId: payload.tenantId,
          subdomain: payload.subdomain,
          planId: payload.planId,
        },
      );
    } catch (error) {
      console.error(`FAILED to mock DNS record: ${error.message}`);
      return new Nack(false);
    }
  }
}