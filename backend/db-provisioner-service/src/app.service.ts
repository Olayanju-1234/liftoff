import { Injectable, Logger } from '@nestjs/common';
import {
  RabbitSubscribe,
  AmqpConnection,
  Nack,
} from '@golevelup/nestjs-rabbitmq';
import { PrismaService } from './prisma.service';
import type { TenantRequestedPayload, TenantDbReadyPayload } from '@liftoff/shared-types';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly amqpConnection: AmqpConnection,
  ) { }

  @RabbitSubscribe({
    exchange: 'provisioning.direct',
    routingKey: 'tenant.requested',
    queue: 'db-provisioner-queue',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'dlx.provisioning',
      deadLetterRoutingKey: 'db-provisioner.failed',
    },
  })
  public async handleTenantRequested(payload: TenantRequestedPayload) {
    this.logger.log(
      { payload },
      `RECEIVED EVENT: Creating schema for ${payload.subdomain}`,
    );

    try {
      const schemaName = `tenant_${payload.subdomain.replace(/[^a-zA-Z0-9]/g, '_')}`;

      await this.prisma.$executeRawUnsafe(
        `CREATE SCHEMA IF NOT EXISTS "${schemaName}";`,
      );

      this.logger.log(
        { schemaName },
        `SUCCESS: Created schema ${schemaName}`,
      );

      await this.amqpConnection.publish(
        'provisioning.direct',
        'tenant.db.ready',
        {
          tenantId: payload.tenantId,
          subdomain: payload.subdomain,
          planId: payload.planId,
        },
      );
    } catch (error) {
      this.logger.error(
        { err: error.message, payload },
        'FAILED to create schema.',
      );
      return new Nack(false);
    }
  }
}