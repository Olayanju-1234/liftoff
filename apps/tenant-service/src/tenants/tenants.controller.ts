// apps/tenant-service/src/tenants/tenants.controller.ts

import { Controller, Post, Body } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';

@Controller('tenants') // This means all routes in this file are prefixed with /tenants
export class TenantsController {
    constructor(private readonly tenantsService: TenantsService) { }

    // 1. Define the POST route
    @Post()
    create(@Body() createTenantDto: CreateTenantDto) {
        // 2. NestJS automatically validates the 'body' against our DTO
        return this.tenantsService.create(createTenantDto);
    }
}