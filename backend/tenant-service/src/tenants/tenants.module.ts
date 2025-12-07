import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { PrismaService } from '../prisma.service';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
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
    }),
  ],
  controllers: [TenantsController],
  providers: [TenantsService, PrismaService],
})
export class TenantsModule { }