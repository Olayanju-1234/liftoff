import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { ConfigService } from '@nestjs/config';
import type { User } from '.prisma/tenant-client';
import { OrganisationsService } from '../organisations/organisations.service';
import { EmailService } from '../email/email.service';
import { hashToken, newToken } from '../common/tokens';
import { errorMessage } from '../common/error-message';

export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

// The same answer whether or not the address has an account.
export const FORGOT_PASSWORD_MESSAGE =
  'If that email has an account, a reset link is on its way. It expires in 1 hour.';

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
  // False until the signup link is opened. API keys need it true.
  emailVerified: boolean;
}

export interface VerifiedEmail {
  id: string;
  email: string;
  emailVerified: true;
}

export interface MessageResponse {
  message: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

type TokenUser = Pick<
  User,
  | 'id'
  | 'email'
  | 'name'
  | 'role'
  | 'organisationId'
  | 'tenantId'
  | 'emailVerified'
>;

export const toSessionUser = (user: TokenUser): SessionUser => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  organisationId: user.organisationId,
  tenantId: user.tenantId,
  emailVerified: user.emailVerified,
});

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private organisations: OrganisationsService,
    private emailService: EmailService,
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
    const verification = newToken();

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        role: 'ADMIN', // First user is admin
        organisation: { create: { name: companyName, handle } },
        verificationToken: hashToken(verification),
        verificationExpiry: new Date(Date.now() + VERIFICATION_TTL_MS),
      },
    });

    const tokens = await this.generateTokens(user);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    this.logger.log(
      `User registered successfully: ${user.id} in organisation ${user.organisationId}`,
    );

    // The account exists either way; the dashboard offers a resend when this fails.
    const sent = await this.emailService.sendVerificationEmail(
      user.email,
      verification,
      user.name ?? undefined,
    );
    if (!sent) {
      this.logger.error(`Could not send the verification email to ${user.id}`);
    }

    return { ...tokens, user: toSessionUser(user) };
  }

  async verifyEmail(token: string): Promise<VerifiedEmail> {
    const verificationToken = hashToken(token);
    // A pending email change uses the same token slot; that link is for /settings/email/confirm.
    const user = await this.prisma.user.findFirst({
      where: { verificationToken, pendingEmail: null, deletedAt: null },
      select: { id: true, verificationExpiry: true },
    });
    if (!user) {
      throw new BadRequestException(
        'This verification link is invalid or has already been used.',
      );
    }
    if (!user.verificationExpiry || user.verificationExpiry <= new Date()) {
      throw new BadRequestException(
        'This verification link has expired. Sign in and ask for a new one.',
      );
    }
    const { count } = await this.prisma.user.updateMany({
      where: { id: user.id, verificationToken },
      data: {
        emailVerified: true,
        verificationToken: null,
        verificationExpiry: null,
      },
    });
    if (count === 0) {
      throw new BadRequestException(
        'This verification link is invalid or has already been used.',
      );
    }
    const verified = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { id: true, email: true },
    });
    this.logger.log(`Verified email for user ${user.id}`);
    return { ...verified, emailVerified: true };
  }

  async resendVerification(userId: string): Promise<MessageResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        pendingEmail: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.emailVerified) {
      return { message: 'Your email is already verified.' };
    }
    if (user.pendingEmail) {
      throw new ConflictException(
        'An email change is waiting for confirmation. Open that link first, or change the email back in Settings.',
      );
    }
    const token = newToken();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        verificationToken: hashToken(token),
        verificationExpiry: new Date(Date.now() + VERIFICATION_TTL_MS),
      },
    });
    const sent = await this.emailService.sendVerificationEmail(
      user.email,
      token,
      user.name ?? undefined,
    );
    if (!sent) {
      throw new ServiceUnavailableException(
        'Could not send the verification email. Try again in a moment.',
      );
    }
    this.logger.log(`Resent verification email to user ${userId}`);
    return { message: `Verification email sent to ${user.email}.` };
  }

  // Never says whether the address has an account.
  async forgotPassword(email: string): Promise<MessageResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email, deletedAt: null },
      select: { id: true, email: true },
    });
    if (!user) {
      this.logger.log('Password reset requested for an unknown email');
      return { message: FORGOT_PASSWORD_MESSAGE };
    }
    const token = newToken();
    const resetToken = hashToken(token);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });
    const sent = await this.emailService.sendPasswordResetEmail(
      user.email,
      token,
    );
    if (!sent) {
      // Nobody received this token, so don't leave it live.
      await this.prisma.user
        .updateMany({
          where: { id: user.id, resetToken },
          data: { resetToken: null, resetTokenExpiry: null },
        })
        .catch((error: unknown) =>
          this.logger.error(
            `Could not clear an unsent reset token for ${user.id}: ${errorMessage(error)}`,
          ),
        );
      this.logger.error(
        `Could not send the password reset email to ${user.id}`,
      );
    } else {
      this.logger.log(`Sent a password reset link to user ${user.id}`);
    }
    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  async resetPassword(
    token: string,
    password: string,
  ): Promise<MessageResponse> {
    const resetToken = hashToken(token);
    const user = await this.prisma.user.findFirst({
      where: { resetToken, deletedAt: null },
      select: { id: true, resetTokenExpiry: true },
    });
    if (!user) {
      throw new BadRequestException(
        'This reset link is invalid or has already been used.',
      );
    }
    if (!user.resetTokenExpiry || user.resetTokenExpiry <= new Date()) {
      throw new BadRequestException(
        'This reset link has expired. Request a new one.',
      );
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    // Single use, and every session is signed out: the old password may have leaked.
    // Opening the link also proves the mailbox, so the email counts as verified.
    const { count } = await this.prisma.user.updateMany({
      where: { id: user.id, resetToken },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
        refreshToken: null,
        emailVerified: true,
      },
    });
    if (count === 0) {
      throw new BadRequestException(
        'This reset link is invalid or has already been used.',
      );
    }
    this.logger.log(`Password reset for user ${user.id}`);
    return { message: 'Password updated. Sign in with your new password.' };
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
