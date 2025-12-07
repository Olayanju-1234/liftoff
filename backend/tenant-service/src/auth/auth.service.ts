import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
    sub: string;
    email: string;
    role: string;
    tenantId: string;
}

export interface TokenResponse {
    accessToken: string;
    refreshToken: string;
    user: {
        id: string;
        email: string;
        name: string | null;
        role: string;
        tenantId: string;
    };
}

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private configService: ConfigService,
    ) { }

    async register(dto: RegisterDto): Promise<TokenResponse> {
        this.logger.log(`Registering new user: ${dto.email}`);

        // Check if user already exists
        const existingUser = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });
        if (existingUser) {
            throw new ConflictException('Email already registered');
        }

        // Check if subdomain is taken
        const existingTenant = await this.prisma.tenant.findUnique({
            where: { subdomain: dto.subdomain },
        });
        if (existingTenant) {
            throw new ConflictException('Subdomain already taken');
        }

        // Get or create default plan
        let plan = await this.prisma.plan.findFirst();
        if (!plan) {
            plan = await this.prisma.plan.create({
                data: {
                    name: 'Basic',
                    maxUsers: 10,
                    maxApiKeys: 5,
                },
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(dto.password, 10);

        // Create tenant and user in a transaction
        const result = await this.prisma.$transaction(async (tx) => {
            const tenant = await tx.tenant.create({
                data: {
                    name: dto.tenantName,
                    subdomain: dto.subdomain,
                    planId: plan.id,
                },
            });

            const user = await tx.user.create({
                data: {
                    email: dto.email,
                    password: hashedPassword,
                    name: dto.name,
                    role: 'ADMIN', // First user is admin
                    tenantId: tenant.id,
                },
            });

            return { tenant, user };
        });

        // Generate tokens
        const tokens = await this.generateTokens(result.user);

        // Save refresh token
        await this.updateRefreshToken(result.user.id, tokens.refreshToken);

        this.logger.log(`User registered successfully: ${result.user.id}`);

        return {
            ...tokens,
            user: {
                id: result.user.id,
                email: result.user.email,
                name: result.user.name,
                role: result.user.role,
                tenantId: result.user.tenantId,
            },
        };
    }

    async login(dto: LoginDto): Promise<TokenResponse> {
        this.logger.log(`Login attempt: ${dto.email}`);

        const user = await this.prisma.user.findUnique({
            where: { email: dto.email, deletedAt: null },
        });

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const passwordValid = await bcrypt.compare(dto.password, user.password);
        if (!passwordValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const tokens = await this.generateTokens(user);
        await this.updateRefreshToken(user.id, tokens.refreshToken);

        this.logger.log(`User logged in: ${user.id}`);

        return {
            ...tokens,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                tenantId: user.tenantId,
            },
        };
    }

    async refreshTokens(refreshToken: string): Promise<TokenResponse> {
        try {
            const payload = this.jwtService.verify(refreshToken, {
                secret: this.configService.get<string>('JWT_REFRESH_SECRET') || 'refresh-secret',
            });

            const user = await this.prisma.user.findUnique({
                where: { id: payload.sub, deletedAt: null },
            });

            if (!user || !user.refreshToken) {
                throw new UnauthorizedException('Invalid refresh token');
            }

            const tokenMatch = await bcrypt.compare(refreshToken, user.refreshToken);
            if (!tokenMatch) {
                throw new UnauthorizedException('Invalid refresh token');
            }

            const tokens = await this.generateTokens(user);
            await this.updateRefreshToken(user.id, tokens.refreshToken);

            return {
                ...tokens,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    tenantId: user.tenantId,
                },
            };
        } catch (error) {
            throw new UnauthorizedException('Invalid refresh token');
        }
    }

    async logout(userId: string): Promise<void> {
        await this.prisma.user.update({
            where: { id: userId },
            data: { refreshToken: null },
        });
        this.logger.log(`User logged out: ${userId}`);
    }

    async validateUser(payload: JwtPayload) {
        const user = await this.prisma.user.findUnique({
            where: { id: payload.sub, deletedAt: null },
        });
        if (!user) {
            throw new UnauthorizedException('User not found');
        }
        return user;
    }

    private async generateTokens(user: { id: string; email: string; role: string; tenantId: string }) {
        const payload: JwtPayload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            tenantId: user.tenantId,
        };

        const [accessToken, refreshToken] = await Promise.all([
            this.jwtService.signAsync(payload, {
                secret: this.configService.get<string>('JWT_SECRET') || 'jwt-secret',
                expiresIn: '15m',
            }),
            this.jwtService.signAsync(payload, {
                secret: this.configService.get<string>('JWT_REFRESH_SECRET') || 'refresh-secret',
                expiresIn: '7d',
            }),
        ]);

        return { accessToken, refreshToken };
    }

    private async updateRefreshToken(userId: string, refreshToken: string) {
        const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
        await this.prisma.user.update({
            where: { id: userId },
            data: { refreshToken: hashedRefreshToken },
        });
    }
}
