import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { OrganisationsController } from './organisations.controller';
import { OrganisationsService } from './organisations.service';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';

@Module({
  controllers: [OrganisationsController, ApiKeysController],
  providers: [OrganisationsService, ApiKeysService, PrismaService],
  exports: [OrganisationsService, ApiKeysService],
})
export class OrganisationsModule {}
