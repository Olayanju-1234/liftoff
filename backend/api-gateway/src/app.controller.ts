import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import {
  API_KEY_HEADER,
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  CancelTenantDto,
  ConfirmEmailChangeDto,
  CreateApiKeyDto,
  CreateTenantDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  UpdateOrganisationDto,
  UpdateSettingsDto,
} from '@liftoff/shared-types';
import { AppService } from './app.service';
import { ParseCuidPipe } from './common/parse-cuid.pipe';

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
  @ApiOperation({
    summary: 'Sign a company up',
    description:
      'Creates the admin user and their organisation (companyName + handle). No tenant is provisioned: tenants are the company’s customers, added with POST /tenants.',
  })
  @ApiResponse({ status: 201, description: 'Tokens + user profile' })
  @ApiResponse({ status: 409, description: 'Email or handle taken' })
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

  // Also open to company API keys, so they are throttled like the other public routes.
  @ApiTags('Tenants')
  @ApiBearerAuth('bearer')
  @ApiSecurity('api-key')
  @ApiHeader({
    name: API_KEY_HEADER,
    required: false,
    description: 'Company API key, instead of a user token',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: `Makes retries safe. Any string up to ${IDEMPOTENCY_KEY_MAX_LENGTH} characters, unique per request (a UUID works). The first response for a key is stored for 24 h per organisation and replayed on a repeat, marked Idempotent-Replayed: true. The same key with a different body gets 422.`,
  })
  @ApiOperation({
    summary: 'Create a customer tenant and start the provisioning pipeline',
    description:
      'Authenticate with a user token or a company API key (x-api-key, or Authorization: Bearer lk_…). 10 requests per minute per IP. Send an Idempotency-Key so a retried request cannot create a second tenant.',
  })
  @ApiResponse({
    status: 202,
    description:
      'Tenant accepted; pipeline started. A replay of an earlier request carries Idempotent-Replayed: true',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid credentials' })
  @ApiResponse({
    status: 409,
    description:
      'Name or subdomain taken, or the first request with this Idempotency-Key is still running',
  })
  @ApiResponse({
    status: 422,
    description: 'Idempotency-Key reused with a different body',
  })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('tenants')
  createTenant(
    @Body() dto: CreateTenantDto,
    @Headers('authorization') auth: string,
    @Headers(API_KEY_HEADER) apiKey: string,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.appService.createTenant(
      dto,
      { auth, apiKey },
      { idempotencyKey },
      reply,
    );
  }

  @ApiTags('Tenants')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: "List the company's tenants" })
  @Get('tenants')
  getTenants(@Headers('authorization') auth: string) {
    return this.appService.getTenants(auth);
  }

  @ApiTags('Tenants')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: "Event log across the company's tenants (most recent 200)",
  })
  @Get('events')
  getEvents(@Headers('authorization') auth: string) {
    return this.appService.getEvents(auth);
  }

  @ApiTags('Tenants')
  @ApiBearerAuth('bearer')
  @ApiSecurity('api-key')
  @ApiHeader({
    name: API_KEY_HEADER,
    required: false,
    description: 'Company API key, instead of a user token',
  })
  @ApiOperation({
    summary: 'Get a single tenant with its step statuses',
    description:
      'Authenticate with a user token or a company API key. 60 requests per minute per IP.',
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('tenants/:id')
  getTenant(
    @Param('id', ParseCuidPipe) id: string,
    @Headers('authorization') auth: string,
    @Headers(API_KEY_HEADER) apiKey: string,
  ) {
    return this.appService.getTenant(id, { auth, apiKey });
  }

  @ApiTags('Tenants')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Event log for a single tenant' })
  @Get('tenants/:id/events')
  getTenantEvents(
    @Param('id', ParseCuidPipe) id: string,
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
    @Param('id', ParseCuidPipe) id: string,
    @Headers('authorization') auth: string,
  ) {
    return this.appService.deleteTenant(id, auth);
  }

  @ApiTags('Tenants')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Cancel an in-progress provisioning pipeline' })
  @ApiResponse({
    status: 400,
    description: 'Tenant is not in PROVISIONING state',
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @Post('tenants/:id/cancel')
  cancelTenant(
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: CancelTenantDto,
    @Headers('authorization') auth: string,
  ) {
    return this.appService.cancelTenant(id, dto, auth);
  }

  // ============ ORGANISATION ENDPOINTS ============

  @ApiTags('Organisation')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: "Get the caller's company" })
  @Get('organisation')
  getOrganisation(@Headers('authorization') auth: string) {
    return this.appService.getOrganisation(auth);
  }

  @ApiTags('Organisation')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: "Update the caller's company",
    description:
      'Setting webhookUrl (or rotateWebhookSecret) returns webhookSecret once. tenant.active and tenant.failed are POSTed there, signed with it in x-liftoff-signature.',
  })
  @ApiResponse({ status: 400, description: 'Private or loopback webhookUrl' })
  @Put('organisation')
  updateOrganisation(
    @Body() dto: UpdateOrganisationDto,
    @Headers('authorization') auth: string,
  ) {
    return this.appService.updateOrganisation(dto, auth);
  }

  @ApiTags('API keys')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Create a company API key',
    description: 'The key is in this response only; store it.',
  })
  @Post('api-keys')
  createApiKey(
    @Body() dto: CreateApiKeyDto,
    @Headers('authorization') auth: string,
  ) {
    return this.appService.createApiKey(dto, auth);
  }

  @ApiTags('API keys')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: "List the company's API keys (prefixes only)" })
  @Get('api-keys')
  listApiKeys(@Headers('authorization') auth: string) {
    return this.appService.listApiKeys(auth);
  }

  @ApiTags('API keys')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Revoke an API key' })
  @ApiResponse({ status: 204, description: 'Revoked' })
  @ApiResponse({ status: 404, description: 'Not one of the company’s keys' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('api-keys/:id')
  async revokeApiKey(
    @Param('id', ParseCuidPipe) id: string,
    @Headers('authorization') auth: string,
  ): Promise<void> {
    await this.appService.revokeApiKey(id, auth);
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
  @ApiOperation({
    summary: 'Update current user settings',
    description:
      'A new email is emailed a confirmation link and stays in pendingEmail until confirmed.',
  })
  @ApiResponse({ status: 409, description: 'Email taken by another account' })
  @Put('settings')
  updateSettings(
    @Body() dto: UpdateSettingsDto,
    @Headers('authorization') auth: string,
  ) {
    return this.appService.updateSettings(dto, auth);
  }

  @ApiTags('Settings')
  @ApiOperation({ summary: 'Confirm a pending email change' })
  @ApiResponse({ status: 200, description: 'The new email is now the login' })
  @ApiResponse({ status: 400, description: 'Invalid, used or expired link' })
  @ApiResponse({ status: 409, description: 'Email taken by another account' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('settings/email/confirm')
  confirmEmailChange(@Body() dto: ConfirmEmailChangeDto) {
    return this.appService.confirmEmailChange(dto);
  }
}
