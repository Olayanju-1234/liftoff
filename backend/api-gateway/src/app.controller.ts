import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import {
  CancelTenantDto,
  CreateTenantDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  UpdateSettingsDto,
} from '@liftoff/shared-types';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // ============ PUBLIC ENDPOINTS ============

  @ApiTags('Health')
  @ApiOperation({ summary: 'Liveness probe' })
  @SkipThrottle()
  @Get('health')
  getHealth(): { status: string; timestamp: string } {
    return this.appService.getHealth();
  }

  @ApiTags('Health')
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // ============ AUTH ENDPOINTS ============

  @ApiTags('Auth')
  @ApiOperation({ summary: 'Register a new tenant + admin user' })
  @ApiResponse({ status: 201, description: 'Tokens + user profile' })
  @ApiResponse({ status: 409, description: 'Email or subdomain taken' })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/register')
  register(@Body() dto: RegisterDto) {
    return this.appService.register(dto);
  }

  @ApiTags('Auth')
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Tokens + user profile' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('auth/login')
  login(@Body() dto: LoginDto) {
    return this.appService.login(dto);
  }

  @ApiTags('Auth')
  @ApiOperation({ summary: 'Exchange refresh token for a new access token' })
  @Post('auth/refresh')
  refreshToken(@Body() dto: RefreshTokenDto) {
    return this.appService.refreshToken(dto);
  }

  @ApiTags('Auth')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Invalidate the current refresh token' })
  @Post('auth/logout')
  logout(@Headers('authorization') auth: string) {
    return this.appService.logout(auth);
  }

  @ApiTags('Auth')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  @Get('auth/me')
  getProfile(@Headers('authorization') auth: string) {
    return this.appService.getProfile(auth);
  }

  // ============ TENANT ENDPOINTS ============

  @ApiTags('Tenants')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Create a tenant and start the provisioning pipeline',
  })
  @ApiResponse({ status: 202, description: 'Tenant accepted; pipeline started' })
  @Post('tenants')
  createTenant(
    @Body() dto: CreateTenantDto,
    @Headers('authorization') auth: string,
  ) {
    return this.appService.createTenant(dto, auth);
  }

  @ApiTags('Tenants')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'List all tenants' })
  @Get('tenants')
  getTenants(@Headers('authorization') auth: string) {
    return this.appService.getTenants(auth);
  }

  @ApiTags('Tenants')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Cross-tenant event log (most recent 200)' })
  @Get('events')
  getEvents(@Headers('authorization') auth: string) {
    return this.appService.getEvents(auth);
  }

  @ApiTags('Tenants')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get a single tenant with its step statuses' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @Get('tenants/:id')
  getTenant(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('authorization') auth: string,
  ) {
    return this.appService.getTenant(id, auth);
  }

  @ApiTags('Tenants')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Event log for a single tenant' })
  @Get('tenants/:id/events')
  getTenantEvents(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('authorization') auth: string,
  ) {
    return this.appService.getTenantEvents(id, auth);
  }

  @ApiTags('Tenants')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Delete a tenant (cascades to events and emits cleanup event)',
  })
  @Delete('tenants/:id')
  deleteTenant(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('authorization') auth: string,
  ) {
    return this.appService.deleteTenant(id, auth);
  }

  @ApiTags('Tenants')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Cancel an in-progress provisioning pipeline' })
  @ApiResponse({ status: 400, description: 'Tenant is not in PROVISIONING state' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @Post('tenants/:id/cancel')
  cancelTenant(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelTenantDto,
    @Headers('authorization') auth: string,
  ) {
    return this.appService.cancelTenant(id, dto, auth);
  }

  // ============ SETTINGS ENDPOINTS ============

  @ApiTags('Settings')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get current user settings' })
  @Get('settings')
  getSettings(@Headers('authorization') auth: string) {
    return this.appService.getSettings(auth);
  }

  @ApiTags('Settings')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update current user settings' })
  @Put('settings')
  updateSettings(
    @Body() dto: UpdateSettingsDto,
    @Headers('authorization') auth: string,
  ) {
    return this.appService.updateSettings(dto, auth);
  }
}
