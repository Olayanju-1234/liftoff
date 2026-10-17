import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, type Settings } from '.prisma/tenant-client';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email/email.service';
import { hashToken, newToken } from '../common/tokens';
import { UpdateSettingsDto } from './dto/update-settings.dto';

export interface SettingsResponse {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  pendingEmail: string | null;
  emailNotifications: boolean;
  failedJobAlerts: boolean;
}

export interface ConfirmedEmail {
  id: string;
  email: string;
}

export const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000;

const NO_PENDING_EMAIL = {
  pendingEmail: null,
  verificationToken: null,
  verificationExpiry: null,
};

const INVALID_LINK =
  'This confirmation link is invalid or has already been used.';
const EMAIL_TAKEN = 'This email is already in use.';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async getSettings(userId: string): Promise<SettingsResponse> {
    const user = await this.findUser(userId);
    const pendingEmail = this.livePendingEmail(user);
    if (user.settings) {
      return this.toResponse(user.settings, user.email, pendingEmail);
    }

    // Upsert, not create: two first GETs can race on the unique userId.
    const settings = await this.prisma.settings.upsert({
      where: { userId },
      create: { userId, ...this.nameDefaults(user.name) },
      update: {},
    });
    this.logger.log(`Created settings for user ${userId}`);
    return this.toResponse(settings, user.email, pendingEmail);
  }

  async updateSettings(
    userId: string,
    dto: UpdateSettingsDto,
  ): Promise<SettingsResponse> {
    const user = await this.findUser(userId);
    const change =
      dto.email !== undefined && dto.email !== user.email
        ? { email: dto.email, token: newToken() }
        : undefined;
    if (change) {
      await this.assertEmailFree(change.email);
    }

    const defaults = this.nameDefaults(user.name);
    const prefs = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      emailNotifications: dto.emailNotifications,
      failedJobAlerts: dto.failedJobAlerts,
    };

    const settings = await this.prisma.$transaction(async (tx) => {
      if (change) {
        await tx.user.update({
          where: { id: userId },
          data: {
            pendingEmail: change.email,
            verificationToken: hashToken(change.token),
            verificationExpiry: new Date(Date.now() + EMAIL_CHANGE_TTL_MS),
          },
        });
      }
      return tx.settings.upsert({
        where: { userId },
        create: {
          ...prefs,
          userId,
          firstName: prefs.firstName ?? defaults.firstName,
          lastName: prefs.lastName ?? defaults.lastName,
        },
        update: prefs,
      });
    });
    this.logger.log(`Updated settings for user ${userId}`);

    if (change) {
      await this.sendConfirmation(userId, change.email, change.token);
      return this.toResponse(settings, user.email, change.email);
    }
    return this.toResponse(settings, user.email, this.livePendingEmail(user));
  }

  async confirmEmailChange(token: string): Promise<ConfirmedEmail> {
    const verificationToken = hashToken(token);
    const user = await this.prisma.user.findFirst({
      where: { verificationToken, deletedAt: null },
      select: { id: true, pendingEmail: true, verificationExpiry: true },
    });
    if (!user?.pendingEmail) {
      throw new BadRequestException(INVALID_LINK);
    }
    if (!user.verificationExpiry || user.verificationExpiry <= new Date()) {
      throw new BadRequestException(
        'This confirmation link has expired. Change your email in Settings to get a new one.',
      );
    }

    try {
      const { email } = await this.prisma.user.update({
        // Also matching the token stops a link that was replaced mid-request from applying.
        where: { id: user.id, verificationToken },
        data: {
          email: user.pendingEmail,
          emailVerified: true,
          ...NO_PENDING_EMAIL,
        },
        select: { email: true },
      });
      this.logger.log(`Confirmed email change for user ${user.id}`);
      return { id: user.id, email };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (
          error.code === 'P2002' &&
          (error.meta?.target as string[] | undefined)?.includes('email')
        ) {
          throw new ConflictException(EMAIL_TAKEN);
        }
        if (error.code === 'P2025') {
          throw new BadRequestException(INVALID_LINK);
        }
      }
      throw error;
    }
  }

  // Soft-deleted users still hold their address under the unique index, so they count too.
  private async assertEmailFree(email: string) {
    const owner = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (owner) {
      throw new ConflictException(EMAIL_TAKEN);
    }
  }

  private async sendConfirmation(userId: string, email: string, token: string) {
    const sent = await this.emailService.sendEmailChangeConfirmation(
      email,
      token,
    );
    if (sent) {
      return;
    }
    this.logger.error(`Could not send email change link for user ${userId}`);
    // Nobody received this token, so don't leave the change waiting on it.
    await this.prisma.user.updateMany({
      where: { id: userId, verificationToken: hashToken(token) },
      data: NO_PENDING_EMAIL,
    });
    throw new ServiceUnavailableException(
      'Could not send the confirmation email. Try again.',
    );
  }

  private async findUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: {
        email: true,
        name: true,
        settings: true,
        pendingEmail: true,
        verificationExpiry: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private livePendingEmail(user: {
    pendingEmail: string | null;
    verificationExpiry: Date | null;
  }) {
    return user.pendingEmail &&
      user.verificationExpiry &&
      user.verificationExpiry > new Date()
      ? user.pendingEmail
      : null;
  }

  private nameDefaults(name: string | null) {
    const [firstName = '', ...rest] = (name ?? '').trim().split(/\s+/);
    return { firstName, lastName: rest.join(' ') };
  }

  private toResponse(
    settings: Settings,
    email: string,
    pendingEmail: string | null,
  ): SettingsResponse {
    return {
      id: settings.id,
      firstName: settings.firstName,
      lastName: settings.lastName,
      email,
      pendingEmail,
      emailNotifications: settings.emailNotifications,
      failedJobAlerts: settings.failedJobAlerts,
    };
  }
}
