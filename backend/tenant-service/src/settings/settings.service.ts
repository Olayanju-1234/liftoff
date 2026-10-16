import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Settings } from '.prisma/tenant-client';
import { PrismaService } from '../prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

export interface SettingsResponse {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  emailNotifications: boolean;
  failedJobAlerts: boolean;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSettings(userId: string): Promise<SettingsResponse> {
    const user = await this.findUser(userId);
    if (user.settings) {
      return this.toResponse(user.settings, user.email);
    }

    // Upsert, not create: two first GETs can race on the unique userId.
    const settings = await this.prisma.settings.upsert({
      where: { userId },
      create: { userId, ...this.nameDefaults(user.name) },
      update: {},
    });
    this.logger.log(`Created settings for user ${userId}`);
    return this.toResponse(settings, user.email);
  }

  async updateSettings(
    userId: string,
    dto: UpdateSettingsDto,
  ): Promise<SettingsResponse> {
    const user = await this.findUser(userId);
    const defaults = this.nameDefaults(user.name);
    const prefs = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      emailNotifications: dto.emailNotifications,
      failedJobAlerts: dto.failedJobAlerts,
    };

    try {
      const [settings, { email }] = await this.prisma.$transaction([
        this.prisma.settings.upsert({
          where: { userId },
          create: {
            ...prefs,
            userId,
            firstName: prefs.firstName ?? defaults.firstName,
            lastName: prefs.lastName ?? defaults.lastName,
          },
          update: prefs,
        }),
        this.prisma.user.update({
          where: { id: userId },
          data: { email: dto.email },
          select: { email: true },
        }),
      ]);
      this.logger.log(`Updated settings for user ${userId}`);
      return this.toResponse(settings, email);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        (error.meta?.target as string[] | undefined)?.includes('email')
      ) {
        throw new ConflictException('This email is already in use.');
      }
      throw error;
    }
  }

  private async findUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { email: true, name: true, settings: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private nameDefaults(name: string | null) {
    const [firstName = '', ...rest] = (name ?? '').trim().split(/\s+/);
    return { firstName, lastName: rest.join(' ') };
  }

  private toResponse(settings: Settings, email: string): SettingsResponse {
    return {
      id: settings.id,
      firstName: settings.firstName,
      lastName: settings.lastName,
      email,
      emailNotifications: settings.emailNotifications,
      failedJobAlerts: settings.failedJobAlerts,
    };
  }
}
