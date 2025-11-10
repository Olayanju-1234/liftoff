import { Controller, Post, Body, Get } from '@nestjs/common';
import { AppService, CreateTenantDto } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get()
  getHello(): string {
    return 'Hello from API Gateway!';
  }

  // 1. Create the public-facing POST /tenants endpoint
  @Post('tenants')
  createTenant(@Body() createTenantDto: CreateTenantDto) {
    // 2. Call the service to proxy the request
    return this.appService.createTenant(createTenantDto);
  }
}