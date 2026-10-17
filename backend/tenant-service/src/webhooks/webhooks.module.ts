import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { WebhookService } from './webhook.service';

@Module({
  providers: [WebhookService, PrismaService],
  exports: [WebhookService],
})
export class WebhooksModule {}
