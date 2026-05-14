import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { CancelTenantDto } from './dto/cancel-tenant.dto';

@ApiTags('Tenants')
@ApiBearerAuth('bearer')
@Controller('tenants')
export class TenantsController {
    constructor(private readonly tenantsService: TenantsService) { }

    @Post()
    @HttpCode(HttpStatus.ACCEPTED)
    @ApiOperation({ summary: 'Create tenant and emit tenant.requested' })
    create(@Body() createTenantDto: CreateTenantDto) {
        return this.tenantsService.create(createTenantDto);
    }

    @Get()
    @ApiOperation({ summary: 'List all tenants' })
    findAll() {
        return this.tenantsService.findAll();
    }

    @Get('events')
    @ApiOperation({ summary: 'Cross-tenant event log (most recent 200)' })
    findAllEvents() {
        return this.tenantsService.findAllEvents();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get tenant with plan and last 100 events' })
    findOne(@Param('id', new ParseUUIDPipe()) id: string) {
        return this.tenantsService.findOne(id);
    }

    @Get(':id/events')
    @ApiOperation({ summary: 'Event log for a single tenant (most recent 200)' })
    findEvents(@Param('id', new ParseUUIDPipe()) id: string) {
        return this.tenantsService.findEvents(id);
    }

    @Post(':id/cancel')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Cancel an in-progress provisioning pipeline' })
    cancel(
        @Param('id', new ParseUUIDPipe()) id: string,
        @Body() cancelDto: CancelTenantDto,
    ) {
        return this.tenantsService.cancel(id, cancelDto.reason);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete tenant and emit tenant.deleted' })
    delete(@Param('id', new ParseUUIDPipe()) id: string) {
        return this.tenantsService.delete(id);
    }
}
