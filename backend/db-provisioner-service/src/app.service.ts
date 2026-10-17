import { Injectable, Logger } from '@nestjs/common';
import {
  RabbitSubscribe,
  AmqpConnection,
  Nack,
} from '@golevelup/nestjs-rabbitmq';
import { PrismaService } from './prisma.service';
import type {
  TenantDeprovisionDonePayload,
  TenantDeprovisionPayload,
  TenantRequestedPayload,
  TenantDbReadyPayload,
} from '@liftoff/shared-types';

// Only ever drop a tenant schema: never public, credentials, or anything a typo could name.
export const TENANT_SCHEMA_PATTERN = /^tenant_[a-zA-Z0-9_]{1,56}$/;

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly amqpConnection: AmqpConnection,
  ) {}

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
      // tenant-service names the schema; messages from before that carried only the subdomain.
      const schemaName =
        payload.schemaName ??
        `tenant_${payload.subdomain.replace(/[^a-zA-Z0-9]/g, '_')}`;

      await this.prisma.$executeRawUnsafe(
        `CREATE SCHEMA IF NOT EXISTS "${schemaName}";`,
      );

      this.logger.log({ schemaName }, `SUCCESS: Created schema ${schemaName}`);

      const dbReady: TenantDbReadyPayload = {
        tenantId: payload.tenantId,
        subdomain: payload.subdomain,
        planId: payload.planId,
        ...(payload.test ? { test: true } : {}),
      };
      await this.amqpConnection.publish(
        'provisioning.direct',
        'tenant.db.ready',
        dbReady,
      );
    } catch (error) {
      this.logger.error(
        {
          err: error instanceof Error ? error.message : String(error),
          payload,
        },
        'FAILED to create schema.',
      );
      return new Nack(false);
    }
  }

  @RabbitSubscribe({
    exchange: 'provisioning.direct',
    routingKey: 'tenant.deprovision',
    queue: 'db-provisioner-deprovision-queue',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'dlx.provisioning',
      deadLetterRoutingKey: 'db-provisioner.deprovision.failed',
    },
  })
  public async handleTenantDeprovision(payload: TenantDeprovisionPayload) {
    const { schemaName, tenantId } = payload;
    try {
      let done: TenantDeprovisionDonePayload;
      if (!schemaName) {
        done = {
          tenantId,
          part: 'db',
          skipped: true,
          detail: 'No schema to drop',
        };
      } else {
        if (!TENANT_SCHEMA_PATTERN.test(schemaName)) {
          throw new Error(`Refusing to drop schema "${schemaName}"`);
        }
        // IF EXISTS makes a replay, or a tenant whose schema was never created, a no-op.
        await this.prisma.$executeRawUnsafe(
          `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE;`,
        );
        this.logger.log(
          { schemaName, tenantId },
          `Dropped schema ${schemaName}`,
        );
        done = { tenantId, part: 'db', skipped: false, detail: schemaName };
      }
      await this.amqpConnection.publish(
        'provisioning.direct',
        'tenant.deprovision.done',
        done,
      );
    } catch (error) {
      this.logger.error(
        {
          err: error instanceof Error ? error.message : String(error),
          payload,
        },
        'FAILED to drop schema.',
      );
      return new Nack(false);
    }
  }
}
