import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { PrismaService } from '../prisma.service';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { ProvisioningTimeoutService } from './provisioning-timeout.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
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
          name: 'dlx.provisioning',
          type: 'direct',
          options: {
            durable: true,
          },
        },
      ],
      uri: process.env.RABBITMQ_URL || 'amqp://devuser:devpassword@localhost:5672',
      connectionInitOptions: { wait: false },
      prefetchCount: 10,
      enableControllerDiscovery: true,
    }),
  ],
  controllers: [TenantsController],
  providers: [TenantsService, PrismaService, ProvisioningTimeoutService],
})
export class TenantsModule { }