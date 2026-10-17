import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ParseCuidPipe } from '../common/parse-cuid.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentOrganisation } from '../auth/decorators/current-organisation.decorator';
import { AllowApiKey } from '../auth/decorators/allow-api-key.decorator';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { CancelTenantDto } from './dto/cancel-tenant.dto';

@ApiTags('Tenants')
@ApiBearerAuth('bearer')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @AllowApiKey()
  @ApiSecurity('api-key')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Create a customer tenant and emit tenant.requested',
    description: 'Accepts a user token or a company API key.',
  })
  create(
    @Body() createTenantDto: CreateTenantDto,
    @CurrentOrganisation() organisationId: string,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.tenantsService.create(createTenantDto, {
      organisationId,
      ownerId: userId ?? null,
    });
  }

  @Get()
  @ApiOperation({ summary: "List the company's tenants" })
  findAll(@CurrentOrganisation() organisationId: string) {
    return this.tenantsService.findAll(organisationId);
  }

  @Get('events')
  @ApiOperation({
    summary: "Event log across the company's tenants (most recent 200)",
  })
  findAllEvents(@CurrentOrganisation() organisationId: string) {
    return this.tenantsService.findAllEvents(organisationId);
  }

  @Get(':id')
  @AllowApiKey()
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'Get tenant with plan and last 100 events',
    description: 'Accepts a user token or a company API key.',
  })
  findOne(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentOrganisation() organisationId: string,
  ) {
    return this.tenantsService.findOne(id, organisationId);
  }

  @Get(':id/events')
  @ApiOperation({ summary: 'Event log for a single tenant (most recent 200)' })
  findEvents(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentOrganisation() organisationId: string,
  ) {
    return this.tenantsService.findEvents(id, organisationId);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an in-progress provisioning pipeline' })
  cancel(
    @Param('id', ParseCuidPipe) id: string,
    @Body() cancelDto: CancelTenantDto,
    @CurrentOrganisation() organisationId: string,
  ) {
    return this.tenantsService.cancel(id, organisationId, cancelDto.reason);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete tenant and emit tenant.deleted' })
  delete(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentOrganisation() organisationId: string,
  ) {
    return this.tenantsService.delete(id, organisationId);
  }
}
