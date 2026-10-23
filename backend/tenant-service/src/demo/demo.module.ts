import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TenantsModule } from '../tenants/tenants.module';
import { StatusModule } from '../status/status.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

@Module({
  imports: [TenantsModule, StatusModule],
  controllers: [DemoController],
  providers: [DemoService, PrismaService],
})
export class DemoModule {}
