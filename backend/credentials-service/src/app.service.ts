import { Injectable, Logger } from '@nestjs/common';
import {
  RabbitSubscribe,
  AmqpConnection,
  Nack,
} from '@golevelup/nestjs-rabbitmq';
import { PrismaService } from './prisma.service';
import { Prisma } from '.prisma/credentials-client';
import * as crypto from 'crypto';
import type {
  TenantDeprovisionDonePayload,
  TenantDeprovisionPayload,
  TenantDnsReadyPayload,
} from '@liftoff/shared-types';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  // Unbound: tenant-service sends this step's input to the queue when the step is due.
  @RabbitSubscribe({
    queue: 'credentials-queue',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'dlx.provisioning',
      deadLetterRoutingKey: 'credentials.failed',
    },
  })
  public async handleTenantDnsReady(payload: TenantDnsReadyPayload) {
    this.logger.log(
      { payload },
      `RECEIVED EVENT: Creating credentials for ${payload.tenantId}`,
    );

    try {
      const newApiKey = `sk_live_${crypto.randomBytes(24).toString('hex')}`;

      await this.prisma.credential.create({
        data: {
          tenantId: payload.tenantId,
          apiKey: newApiKey,
        },
      });

      this.logger.log(
        { tenantId: payload.tenantId },
        `SUCCESS: Saved credentials for ${payload.tenantId}`,
      );

      await this.amqpConnection.publish(
        'provisioning.direct',
        'tenant.credentials.ready',
        payload,
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.warn(
          { payload },
          `WARN: Credentials for ${payload.tenantId} already exist. Republishing event.`,
        );
        await this.amqpConnection.publish(
          'provisioning.direct',
          'tenant.credentials.ready',
          payload,
        );
        return;
      } else {
        this.logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            payload,
          },
          `FAILED to create credentials for ${payload.tenantId}.`,
        );
        return new Nack(false);
      }
    }
  }

  // Revoking deletes the key outright: nothing keeps a revoked secret around.
  @RabbitSubscribe({
    exchange: 'provisioning.direct',
    routingKey: 'tenant.deprovision',
    queue: 'credentials-deprovision-queue',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'dlx.provisioning',
      deadLetterRoutingKey: 'credentials.deprovision.failed',
    },
  })
  public async handleTenantDeprovision(payload: TenantDeprovisionPayload) {
    try {
      const { count } = await this.prisma.credential.deleteMany({
        where: { tenantId: payload.tenantId },
      });
      const done: TenantDeprovisionDonePayload = {
        tenantId: payload.tenantId,
        part: 'credentials',
        skipped: count === 0,
        detail: count === 0 ? 'No key to revoke' : `Revoked ${count} key(s)`,
      };
      this.logger.log(
        { tenantId: payload.tenantId, revoked: count },
        `Revoked credentials for ${payload.tenantId}`,
      );
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
        `FAILED to revoke credentials for ${payload.tenantId}.`,
      );
      return new Nack(false);
    }
  }
}
