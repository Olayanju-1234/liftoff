import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { CreateTenantDto } from '@liftoff/shared-types';
import { AuthGuard } from './auth/auth.guard';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get('health')
  getHealth(): { status: string } {
    return this.appService.getHealth();
  }

  @Get()
  @UseGuards(AuthGuard)
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('tenants')
  @UseGuards(AuthGuard)
  createTenant(@Body() createTenantDto: CreateTenantDto) {
    return this.appService.createTenant(createTenantDto);
  }
}