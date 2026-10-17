import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { OrganisationsController } from './organisations.controller';
import { OrganisationsService } from './organisations.service';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { OrgSecretsService } from './org-secrets.service';

@Module({
  controllers: [OrganisationsController, ApiKeysController],
  providers: [
    OrganisationsService,
    ApiKeysService,
    OrgSecretsService,
    PrismaService,
  ],
  exports: [OrganisationsService, ApiKeysService, OrgSecretsService],
})
export class OrganisationsModule {}
