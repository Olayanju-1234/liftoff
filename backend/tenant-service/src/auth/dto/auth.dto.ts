import { IsEmail, IsNotEmpty, IsString, MinLength, MaxLength, IsOptional } from 'class-validator';

export class RegisterDto {
    @IsEmail({}, { message: 'Invalid email format' })
    @IsNotEmpty({ message: 'Email is required' })
    email: string;

    @IsString()
    @IsNotEmpty({ message: 'Password is required' })
    @MinLength(8, { message: 'Password must be at least 8 characters' })
    @MaxLength(100, { message: 'Password too long' })
    password: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    name?: string;

    @IsString()
    @IsNotEmpty({ message: 'Tenant name is required' })
    @MaxLength(100)
    tenantName: string;

    @IsString()
    @IsNotEmpty({ message: 'Subdomain is required' })
    @MaxLength(50)
    subdomain: string;
}

export class LoginDto {
    @IsEmail({}, { message: 'Invalid email format' })
    @IsNotEmpty({ message: 'Email is required' })
    email: string;

    @IsString()
    @IsNotEmpty({ message: 'Password is required' })
    password: string;
}

export class RefreshTokenDto {
    @IsString()
    @IsNotEmpty({ message: 'Refresh token is required' })
    refreshToken: string;
}
