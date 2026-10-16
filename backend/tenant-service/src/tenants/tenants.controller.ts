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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseCuidPipe } from '../common/parse-cuid.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { CancelTenantDto } from './dto/cancel-tenant.dto';

@ApiTags('Tenants')
@ApiBearerAuth('bearer')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Create tenant and emit tenant.requested' })
  create(
    @Body() createTenantDto: CreateTenantDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.tenantsService.create(createTenantDto, userId);
  }

  @Get()
  @ApiOperation({ summary: "List the caller's tenants" })
  findAll(@CurrentUser('id') userId: string) {
    return this.tenantsService.findAll(userId);
  }

  @Get('events')
  @ApiOperation({
    summary: "Event log across the caller's tenants (most recent 200)",
  })
  findAllEvents(@CurrentUser('id') userId: string) {
    return this.tenantsService.findAllEvents(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tenant with plan and last 100 events' })
  findOne(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tenantsService.findOne(id, userId);
  }

  @Get(':id/events')
  @ApiOperation({ summary: 'Event log for a single tenant (most recent 200)' })
  findEvents(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tenantsService.findEvents(id, userId);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an in-progress provisioning pipeline' })
  cancel(
    @Param('id', ParseCuidPipe) id: string,
    @Body() cancelDto: CancelTenantDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.tenantsService.cancel(id, userId, cancelDto.reason);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete tenant and emit tenant.deleted' })
  delete(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tenantsService.delete(id, userId);
  }
}
