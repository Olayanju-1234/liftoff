import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { WebhookService } from './webhook.service';
import { StatusModule } from '../status/status.module';
import { DurableModule } from '../durable/durable.module';

@Module({
  imports: [StatusModule, DurableModule],
  providers: [WebhookService, PrismaService],
  exports: [WebhookService],
})
export class WebhooksModule {}
