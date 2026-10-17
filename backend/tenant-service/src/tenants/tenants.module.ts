import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { PrismaService } from '../prisma.service';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { ProvisioningTimeoutService } from './provisioning-timeout.service';
import { IdempotencyService } from './idempotency.service';
import { QuotasService } from './quotas.service';
import { DEAD_LETTER_EXCHANGE, DEAD_LETTER_QUEUE } from './dead-letters';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { StatusModule } from '../status/status.module';
import { CustomStepsService } from './custom-steps.service';
import { StepBindingsService } from './step-bindings.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    WebhooksModule,
    StatusModule,
    RabbitMQModule.forRoot({
      exchanges: [
        {
          name: 'provisioning.direct',
          type: 'direct',
          options: {
            durable: true,
          },
        },
        {
          name: DEAD_LETTER_EXCHANGE,
          type: 'direct',
          options: {
            durable: true,
          },
        },
      ],
      queues: [DEAD_LETTER_QUEUE],
      uri:
        process.env.RABBITMQ_URL || 'amqp://devuser:devpassword@localhost:5672',
      connectionInitOptions: { wait: false, reject: false },
      prefetchCount: 10,
      enableControllerDiscovery: true,
    }),
  ],
  controllers: [TenantsController],
  providers: [
    TenantsService,
    PrismaService,
    ProvisioningTimeoutService,
    IdempotencyService,
    QuotasService,
    CustomStepsService,
    StepBindingsService,
  ],
  exports: [TenantsService],
})
export class TenantsModule {}
