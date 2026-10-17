import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { WebhookService } from './webhook.service';
import { StatusModule } from '../status/status.module';

@Module({
  imports: [StatusModule],
  providers: [WebhookService, PrismaService],
  exports: [WebhookService],
})
export class WebhooksModule {}
