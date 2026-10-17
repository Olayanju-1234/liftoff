import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';
import { StatusTokenService } from './status-token.service';

@Module({
  controllers: [StatusController],
  providers: [StatusService, StatusTokenService, PrismaService],
  exports: [StatusTokenService],
})
export class StatusModule {}
