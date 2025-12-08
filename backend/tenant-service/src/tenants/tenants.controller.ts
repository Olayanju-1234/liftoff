import { Controller, Post, Body, Get, Param, Delete, BadRequestException, NotFoundException } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { CancelTenantDto } from './dto/cancel-tenant.dto';

@Controller('tenants')
export class TenantsController {
    constructor(private readonly tenantsService: TenantsService) { }

    @Post()
    create(@Body() createTenantDto: CreateTenantDto) {
        return this.tenantsService.create(createTenantDto);
    }

    @Get()
    findAll() {
        return this.tenantsService.findAll();
    }

    @Get('events')
    findAllEvents() {
        return this.tenantsService.findAllEvents();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.tenantsService.findOne(id);
    }

    @Get(':id/events')
    findEvents(@Param('id') id: string) {
        return this.tenantsService.findEvents(id);
    }

    @Post(':id/cancel')
    async cancel(@Param('id') id: string, @Body() cancelDto: CancelTenantDto) {
        try {
            return await this.tenantsService.cancel(id, cancelDto.reason);
        } catch (error) {
            if (error.message.includes('not found')) {
                throw new NotFoundException(error.message);
            }
            throw new BadRequestException(error.message);
        }
    }

    @Delete(':id')
    async delete(@Param('id') id: string) {
        try {
            return await this.tenantsService.delete(id);
        } catch (error) {
            if (error.message.includes('not found')) {
                throw new NotFoundException(error.message);
            }
            throw new BadRequestException(error.message);
        }
    }
}
