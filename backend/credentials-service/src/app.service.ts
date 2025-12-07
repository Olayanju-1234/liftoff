import { Injectable, Logger } from '@nestjs/common';
import {
  RabbitSubscribe,
  AmqpConnection,
  Nack,
} from '@golevelup/nestjs-rabbitmq';
import { PrismaService } from './prisma.service';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import * as crypto from 'crypto';
import type { TenantDnsReadyPayload } from '@liftoff/shared-types';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly amqpConnection: AmqpConnection,
  ) { }

  @RabbitSubscribe({
    exchange: 'provisioning.direct',
    routingKey: 'tenant.dns.ready',
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
        error instanceof PrismaClientKnownRequestError &&
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
          { err: error.message, payload },
          `FAILED to create credentials for ${payload.tenantId}.`,
        );
        return new Nack(false);
      }
    }
  }
}