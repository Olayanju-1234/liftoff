import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelTenantDto {
    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string;
}
