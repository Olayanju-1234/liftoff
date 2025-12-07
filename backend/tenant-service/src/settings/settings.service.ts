import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
    private readonly logger = new Logger(SettingsService.name);

    constructor(private readonly prisma: PrismaService) { }

    // For now, we'll use a default user ID since we don't have auth
    // In production, this would come from the authenticated user
    private readonly DEFAULT_USER_ID = 'default-user';

    async getSettings() {
        this.logger.log('Fetching settings...');

        // Try to find existing settings
        let settings = await this.prisma.settings.findFirst({
            include: { user: true },
        });

        // If no settings exist, create a default user and settings
        if (!settings) {
            this.logger.log('No settings found, creating defaults...');

            // First check if we have any plans, if not create one
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

            // Check for any tenant
            let tenant = await this.prisma.tenant.findFirst();
            if (!tenant) {
                tenant = await this.prisma.tenant.create({
                    data: {
                        name: 'Default Organization',
                        subdomain: 'default',
                        planId: plan.id,
                    },
                });
            }

            // Create default user
            const user = await this.prisma.user.create({
                data: {
                    email: 'ops@saascompany.com',
                    name: 'DevOps Engineer',
                    password: 'hashed_password_placeholder',
                    role: 'ADMIN',
                    tenantId: tenant.id,
                },
            });

            // Create settings for this user
            settings = await this.prisma.settings.create({
                data: {
                    userId: user.id,
                    firstName: 'DevOps',
                    lastName: 'Engineer',
                    emailNotifications: true,
                    failedJobAlerts: true,
                },
                include: { user: true },
            });
        }

        return {
            id: settings.id,
            firstName: settings.firstName,
            lastName: settings.lastName,
            email: settings.user.email,
            emailNotifications: settings.emailNotifications,
            failedJobAlerts: settings.failedJobAlerts,
        };
    }

    async updateSettings(updateSettingsDto: UpdateSettingsDto) {
        this.logger.log({ dto: updateSettingsDto }, 'Updating settings...');

        // Get existing settings
        const existingSettings = await this.prisma.settings.findFirst({
            include: { user: true },
        });

        if (!existingSettings) {
            throw new NotFoundException('Settings not found. Please get settings first to initialize.');
        }

        // Update settings
        const settings = await this.prisma.settings.update({
            where: { id: existingSettings.id },
            data: {
                firstName: updateSettingsDto.firstName ?? existingSettings.firstName,
                lastName: updateSettingsDto.lastName ?? existingSettings.lastName,
                emailNotifications: updateSettingsDto.emailNotifications ?? existingSettings.emailNotifications,
                failedJobAlerts: updateSettingsDto.failedJobAlerts ?? existingSettings.failedJobAlerts,
            },
            include: { user: true },
        });

        // If email is being updated, update the user as well
        if (updateSettingsDto.email && updateSettingsDto.email !== settings.user.email) {
            await this.prisma.user.update({
                where: { id: settings.userId },
                data: { email: updateSettingsDto.email },
            });
        }

        this.logger.log('Settings updated successfully');

        return {
            id: settings.id,
            firstName: settings.firstName,
            lastName: settings.lastName,
            email: updateSettingsDto.email || settings.user.email,
            emailNotifications: settings.emailNotifications,
            failedJobAlerts: settings.failedJobAlerts,
        };
    }
}
