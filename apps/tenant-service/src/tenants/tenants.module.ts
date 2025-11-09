import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { PrismaService } from '../prisma.service';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq'; // <-- 1. Import

@Module({
  imports: [
    // 2. Add the configuration here
    RabbitMQModule.forRoot({
      exchanges: [
        {
          name: 'provisioning.direct',
          type: 'direct',
        },
      ],
      uri: 'amqp://devuser:devpassword@localhost:5672',
      connectionInitOptions: { wait: false },
    }),
  ],
  controllers: [TenantsController],
  providers: [TenantsService, PrismaService],
})
export class TenantsModule { }