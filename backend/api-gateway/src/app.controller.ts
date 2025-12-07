import { Controller, Post, Body, Get, Param, Delete, Put } from '@nestjs/common';
import { AppService } from './app.service';
import { CreateTenantDto } from '@liftoff/shared-types';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get('health')
  getHealth(): { status: string } {
    return this.appService.getHealth();
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('tenants')
  createTenant(@Body() createTenantDto: CreateTenantDto) {
    return this.appService.createTenant(createTenantDto);
  }

  @Get('tenants')
  getTenants() {
    return this.appService.getTenants();
  }

  @Get('events')
  getEvents() {
    return this.appService.getEvents();
  }

  @Get('tenants/:id')
  getTenant(@Param('id') id: string) {
    return this.appService.getTenant(id);
  }

  @Get('tenants/:id/events')
  getTenantEvents(@Param('id') id: string) {
    return this.appService.getTenantEvents(id);
  }

  @Delete('tenants/:id')
  deleteTenant(@Param('id') id: string) {
    return this.appService.deleteTenant(id);
  }

  @Get('settings')
  getSettings() {
    return this.appService.getSettings();
  }

  @Put('settings')
  updateSettings(@Body() updateSettingsDto: any) {
    return this.appService.updateSettings(updateSettingsDto);
  }
}