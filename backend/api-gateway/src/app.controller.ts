import { Controller, Post, Body, Get, Param, Delete, Put, Headers, Req } from '@nestjs/common';
import { AppService } from './app.service';
import { CreateTenantDto } from '@liftoff/shared-types';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  // ============ PUBLIC ENDPOINTS ============

  @SkipThrottle()
  @Get('health')
  getHealth(): { status: string; timestamp: string } {
    return this.appService.getHealth();
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // ============ AUTH ENDPOINTS ============

  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute for auth
  @Post('auth/register')
  register(@Body() registerDto: any) {
    return this.appService.register(registerDto);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 login attempts per minute
  @Post('auth/login')
  login(@Body() loginDto: any) {
    return this.appService.login(loginDto);
  }

  @Post('auth/refresh')
  refreshToken(@Body() refreshDto: any) {
    return this.appService.refreshToken(refreshDto);
  }

  @Post('auth/logout')
  logout(@Headers('authorization') auth: string) {
    return this.appService.logout(auth);
  }

  @Get('auth/me')
  getProfile(@Headers('authorization') auth: string) {
    return this.appService.getProfile(auth);
  }

  // ============ TENANT ENDPOINTS ============

  @Post('tenants')
  createTenant(@Body() createTenantDto: CreateTenantDto, @Headers('authorization') auth: string) {
    return this.appService.createTenant(createTenantDto, auth);
  }

  @Get('tenants')
  getTenants(@Headers('authorization') auth: string) {
    return this.appService.getTenants(auth);
  }

  @Get('events')
  getEvents(@Headers('authorization') auth: string) {
    return this.appService.getEvents(auth);
  }

  @Get('tenants/:id')
  getTenant(@Param('id') id: string, @Headers('authorization') auth: string) {
    return this.appService.getTenant(id, auth);
  }

  @Get('tenants/:id/events')
  getTenantEvents(@Param('id') id: string, @Headers('authorization') auth: string) {
    return this.appService.getTenantEvents(id, auth);
  }

  @Delete('tenants/:id')
  deleteTenant(@Param('id') id: string, @Headers('authorization') auth: string) {
    return this.appService.deleteTenant(id, auth);
  }

  @Post('tenants/:id/cancel')
  cancelTenant(
    @Param('id') id: string,
    @Body() cancelDto: any,
    @Headers('authorization') auth: string
  ) {
    return this.appService.cancelTenant(id, cancelDto, auth);
  }

  // ============ SETTINGS ENDPOINTS ============

  @Get('settings')
  getSettings(@Headers('authorization') auth: string) {
    return this.appService.getSettings(auth);
  }

  @Put('settings')
  updateSettings(@Body() updateSettingsDto: any, @Headers('authorization') auth: string) {
    return this.appService.updateSettings(updateSettingsDto, auth);
  }
}