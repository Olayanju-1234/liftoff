import { Module } from '@nestjs/common';
import { DurableService } from './durable.service';

@Module({
  providers: [DurableService],
  exports: [DurableService],
})
export class DurableModule {}
