import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService, TokenResponse } from './auth.service';
import { RegisterDto, LoginDto, RefreshTokenDto } from './dto/auth.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Public()
    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Register a new tenant + admin user' })
    async register(@Body() dto: RegisterDto): Promise<TokenResponse> {
        return this.authService.register(dto);
    }

    @Public()
    @Post('login')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Login with email and password' })
    async login(@Body() dto: LoginDto): Promise<TokenResponse> {
        return this.authService.login(dto);
    }

    @Public()
    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Exchange refresh token for new tokens' })
    async refresh(@Body() dto: RefreshTokenDto): Promise<TokenResponse> {
        return this.authService.refreshTokens(dto.refreshToken);
    }

    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('bearer')
    @Post('logout')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Invalidate refresh token' })
    async logout(@CurrentUser('id') userId: string): Promise<{ message: string }> {
        await this.authService.logout(userId);
        return { message: 'Logged out successfully' };
    }

    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('bearer')
    @Get('me')
    @ApiOperation({ summary: 'Get authenticated user profile' })
    async getProfile(@CurrentUser() user: any) {
        return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            tenantId: user.tenantId,
        };
    }
}
