import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrganisation } from '../auth/decorators/current-organisation.decorator';
import { OrganisationsService } from './organisations.service';
import { UpdateOrganisationDto } from './dto/update-organisation.dto';

@ApiTags('Organisation')
@ApiBearerAuth('bearer')
@Controller('organisation')
export class OrganisationsController {
  constructor(private readonly organisations: OrganisationsService) {}

  @Get()
  @ApiOperation({ summary: "Get the caller's company" })
  get(@CurrentOrganisation() organisationId: string) {
    return this.organisations.get(organisationId);
  }

  @Put()
  @ApiOperation({
    summary: "Update the caller's company",
    description:
      'Setting webhookUrl (or rotateWebhookSecret) returns webhookSecret once. Store it: tenant.active and tenant.failed deliveries are signed with it.',
  })
  update(
    @Body() dto: UpdateOrganisationDto,
    @CurrentOrganisation() organisationId: string,
  ) {
    return this.organisations.update(organisationId, dto);
  }
}
