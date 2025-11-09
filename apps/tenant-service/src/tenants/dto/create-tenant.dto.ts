// apps/tenant-service/src/tenants/dto/create-tenant.dto.ts

import { IsNotEmpty, IsString, IsAlpha, MaxLength } from 'class-validator';

export class CreateTenantDto {
    @IsString()
    @IsNotEmpty()
    name: string; // e.g., "Acme Inc."

    @IsString()
    @IsNotEmpty()
    @IsAlpha() // Only letters, no numbers or symbols
    @MaxLength(30)
    subdomain: string; // e.g., "acme"

    @IsString()
    @IsNotEmpty()
    planId: string; // e.g., "plan_basic"
}