import { IsNotEmpty, IsString, IsAlpha, MaxLength } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  @IsAlpha()
  @MaxLength(30)
  subdomain: string;

  @IsString()
  @IsNotEmpty()
  planId: string;
}

// Event Payloads (for RabbitMQ)

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
}

export interface ProvisioningCompletePayload {
  tenantId: string;
  subdomain: string;
}