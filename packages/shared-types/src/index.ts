import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsAlpha,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

// ============================================================================
// Tenant DTOs
// ============================================================================

export class CreateTenantDto {
  @ApiProperty({ example: 'Acme Corp', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    example: 'acme',
    description: 'Alphabetic only, used as the tenant subdomain.',
    maxLength: 30,
  })
  @IsString()
  @IsNotEmpty()
  @IsAlpha()
  @MaxLength(30)
  subdomain: string;

  @ApiProperty({ example: 'starter', description: 'Plan name or ID.' })
  @IsString()
  @IsNotEmpty()
  planId: string;
}

export class CancelTenantDto {
  @ApiPropertyOptional({
    example: 'Customer changed plan',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

// ============================================================================
// Auth DTOs
// ============================================================================

// Letters, digits and single hyphens, like a GitHub handle. Stored lowercase.
export const HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

export class RegisterDto {
  @ApiProperty({ example: 'admin@acme.com' })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({ minLength: 8, maxLength: 100, example: 'CorrectHorse9!' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(100, { message: 'Password too long' })
  password: string;

  @ApiPropertyOptional({ example: 'Jane Doe', maxLength: 100 })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiProperty({
    example: 'Acme Corp',
    maxLength: 100,
    description: 'The company signing up. Its customers become tenants.',
  })
  @ValidateIf((dto: RegisterDto) => dto.tenantName === undefined)
  @IsString()
  @IsNotEmpty({ message: 'Company name is required' })
  @MaxLength(100)
  companyName?: string;

  @ApiProperty({
    example: 'acme',
    minLength: 3,
    maxLength: 50,
    description: 'Unique, URL-safe name for the company. Case-insensitive.',
  })
  @ValidateIf((dto: RegisterDto) => dto.subdomain === undefined)
  @IsString()
  @IsNotEmpty({ message: 'Handle is required' })
  @MinLength(3)
  @MaxLength(50)
  @Matches(HANDLE_PATTERN, {
    message: 'Handle may only contain letters, digits and hyphens',
  })
  handle?: string;

  // Older clients send these; they mean the same as companyName and handle.
  @ApiPropertyOptional({ deprecated: true, description: 'Use companyName.' })
  @ValidateIf((dto: RegisterDto) => dto.companyName === undefined)
  @IsString()
  @IsNotEmpty({ message: 'Company name is required' })
  @MaxLength(100)
  tenantName?: string;

  @ApiPropertyOptional({ deprecated: true, description: 'Use handle.' })
  @ValidateIf((dto: RegisterDto) => dto.handle === undefined)
  @IsString()
  @IsNotEmpty({ message: 'Handle is required' })
  @MinLength(3)
  @MaxLength(50)
  @Matches(HANDLE_PATTERN, {
    message: 'Handle may only contain letters, digits and hyphens',
  })
  subdomain?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'admin@acme.com' })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({ example: 'CorrectHorse9!' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token returned at login' })
  @IsString()
  @IsNotEmpty({ message: 'Refresh token is required' })
  refreshToken: string;
}

// ============================================================================
// Settings DTOs
// ============================================================================

export class UpdateSettingsDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({
    description:
      'A new email stays pending until the link sent to it is confirmed.',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  failedJobAlerts?: boolean;
}

export class ConfirmEmailChangeDto {
  @ApiProperty({ description: 'Token from the confirmation link' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token: string;
}

// ============================================================================
// Organisation DTOs
// ============================================================================

export class UpdateOrganisationDto {
  @ApiPropertyOptional({ example: 'Acme Corp', maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    example: 'https://api.acme.com/liftoff/webhook',
    nullable: true,
    description:
      'Where tenant.active and tenant.failed are POSTed. Setting a new URL issues a new signing secret, returned once. null turns deliveries off.',
  })
  @IsOptional()
  @ValidateIf((dto: UpdateOrganisationDto) => dto.webhookUrl !== null)
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  @MaxLength(2000)
  webhookUrl?: string | null;

  @ApiPropertyOptional({
    description:
      'Issue a new signing secret for the current URL. Returned once; the old one stops working.',
  })
  @IsOptional()
  @IsBoolean()
  rotateWebhookSecret?: boolean;
}

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Billing integration', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

// Header for company API keys. A key is also accepted as `Authorization: Bearer <key>`.
export const API_KEY_HEADER = 'x-api-key';
export const API_KEY_PREFIX = 'lk_';

// ============================================================================
// Idempotency
// ============================================================================

// Sent on POST /tenants. The first response for a key is stored per organisation for
// 24 h and replayed on a repeat; a repeat with a different body gets 422.
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const IDEMPOTENCY_KEY_MAX_LENGTH = 255;
// Set to "true" on a response that was replayed rather than produced by this request.
export const IDEMPOTENT_REPLAYED_HEADER = 'idempotent-replayed';

// ============================================================================
// Webhooks
// ============================================================================

export const WEBHOOK_SIGNATURE_HEADER = 'x-liftoff-signature';
export const WEBHOOK_EVENT_HEADER = 'x-liftoff-event';
export const WEBHOOK_DELIVERY_HEADER = 'x-liftoff-delivery';

export type TenantWebhookEvent = 'tenant.active' | 'tenant.failed';

export interface TenantWebhookPayload<TTenant = unknown> {
  event: TenantWebhookEvent;
  tenant: TTenant;
}

// ============================================================================
// Plans
// ============================================================================

// Billing prices exactly these IDs, so seeds and signups must use them.
export const PLAN_IDS = ['starter', 'pro', 'enterprise'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

// ============================================================================
// Event Payloads (RabbitMQ)
// ============================================================================

export interface TenantRequestedPayload {
  tenantId: string;
  subdomain: string;
  planId: string;
}

export interface TenantDbReadyPayload {
  tenantId: string;
  subdomain: string;
  planId: string;
}

export interface TenantDnsReadyPayload {
  tenantId: string;
  subdomain: string;
  planId: string;
}

export interface TenantCredentialsReadyPayload {
  tenantId: string;
  subdomain: string;
  planId: string;
}

export interface TenantBillingActivePayload {
  tenantId: string;
  subdomain: string;
  planId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  subscriptionStatus: string;
  trialEnd: string | null;
}

export interface ProvisioningCompletePayload {
  tenantId: string;
  subdomain: string;
}
