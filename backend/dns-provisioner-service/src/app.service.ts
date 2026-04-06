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
    routingKey: 'tenant.db.ready',
    queue: 'dns-provisioner-queue',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'dlx.provisioning',
      deadLetterRoutingKey: 'dns-provisioner.failed',
    },
  })
  public async handleTenantDbReady(payload: sharedTypes.TenantDbReadyPayload) {
    this.logger.log(`Creating DNS record for ${payload.subdomain}`);

    try {
      await sleep(2000);

      this.logger.log(`DNS record created for ${payload.subdomain}`);

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
      this.logger.error(`Failed to create DNS record for ${payload.subdomain}: ${error.message}`);
      return new Nack(false);
    }
  }
}
