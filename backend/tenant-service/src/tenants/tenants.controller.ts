import { Controller, Post, Body, Get, Param, Delete } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';

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

    @Delete(':id')
    delete(@Param('id') id: string) {
        return this.tenantsService.delete(id);
    }
}