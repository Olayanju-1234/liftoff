import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { ConfigService } from '@nestjs/config';
import type { User } from '.prisma/tenant-client';
import { OrganisationsService } from '../organisations/organisations.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  organisationId: string | null;
  // Legacy workspace tenant; null for accounts created since organisations.
  tenantId: string | null;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  organisationId: string | null;
  tenantId: string | null;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

type TokenUser = Pick<
  User,
  'id' | 'email' | 'name' | 'role' | 'organisationId' | 'tenantId'
>;

export const toSessionUser = (user: TokenUser): SessionUser => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  organisationId: user.organisationId,
  tenantId: user.tenantId,
});

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private organisations: OrganisationsService,
  ) {}

  // Signs a company up: one User and one Organisation. Its customers are added later as tenants.
  async register(dto: RegisterDto): Promise<TokenResponse> {
    this.logger.log(`Registering new user: ${dto.email}`);
    const companyName = (dto.companyName ?? dto.tenantName ?? '').trim();
    const handle = (dto.handle ?? dto.subdomain ?? '').toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }
    await this.organisations.assertHandleFree(handle);

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        role: 'ADMIN', // First user is admin
        organisation: { create: { name: companyName, handle } },
      },
    });

    const tokens = await this.generateTokens(user);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    this.logger.log(
      `User registered successfully: ${user.id} in organisation ${user.organisationId}`,
    );

    return { ...tokens, user: toSessionUser(user) };
  }

  async login(dto: LoginDto): Promise<TokenResponse> {
    this.logger.log(`Login attempt: ${dto.email}`);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email, deletedAt: null },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(user);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    this.logger.log(`User logged in: ${user.id}`);

    return { ...tokens, user: toSessionUser(user) };
  }

  async refreshTokens(refreshToken: string): Promise<TokenResponse> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
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

      return { ...tokens, user: toSessionUser(user) };
    } catch {
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

  private async generateTokens(user: TokenUser) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      organisationId: user.organisationId,
      tenantId: user.tenantId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
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
