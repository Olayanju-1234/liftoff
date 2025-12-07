import { IsString, IsBoolean, IsOptional, IsEmail } from 'class-validator';

export class UpdateSettingsDto {
    @IsOptional()
    @IsString()
    firstName?: string;

    @IsOptional()
    @IsString()
    lastName?: string;

    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsBoolean()
    emailNotifications?: boolean;

    @IsOptional()
    @IsBoolean()
    failedJobAlerts?: boolean;
}
