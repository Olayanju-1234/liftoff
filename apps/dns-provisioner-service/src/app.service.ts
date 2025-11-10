// apps/dns-provisioner-service/src/app.service.ts

import { Injectable } from '@nestjs/common';
import { RabbitSubscribe, AmqpConnection } from '@golevelup/nestjs-rabbitmq';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface TenantDbReadyPayload {
  tenantId: string;
  subdomain: string;
}

@Injectable()
export class AppService {
  constructor(private readonly amqpConnection: AmqpConnection) { }

  @RabbitSubscribe({
    exchange: 'provisioning.direct',
    routingKey: 'tenant.db.ready',
    queue: 'dns-provisioner-queue',
    queueOptions: {
      durable: true,
    },
  })
  public async handleTenantDbReady(payload: TenantDbReadyPayload) {
    console.log(
      `RECEIVED EVENT: Mock creating DNS record for ${payload.subdomain}`,
    );

    try {
      // --- THIS IS THE MOCK ---
      // We "pretend" to be calling an API by waiting for 2 seconds
      await sleep(2000);
      // -------------------------

      console.log(
        `SUCCESS: Mock created DNS record for ${payload.subdomain}`,
      );

      // Publish the next event just like the real service would
      await this.amqpConnection.publish(
        'provisioning.direct',
        'tenant.dns.ready', // The next routing key
        payload,
      );
    } catch (error) {
      console.error(`FAILED to mock DNS record: ${error.message}`);
    }
  }
}