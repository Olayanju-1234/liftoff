import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsAlpha,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
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

  @ApiProperty({ example: 'Acme Corp', maxLength: 100 })
  @IsString()
  @IsNotEmpty({ message: 'Tenant name is required' })
  @MaxLength(100)
  tenantName: string;

  @ApiProperty({ example: 'acme', maxLength: 50 })
  @IsString()
  @IsNotEmpty({ message: 'Subdomain is required' })
  @MaxLength(50)
  subdomain: string;
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

  @ApiPropertyOptional()
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
