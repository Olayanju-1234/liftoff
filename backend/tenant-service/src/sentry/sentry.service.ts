import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';

@Injectable()
export class SentryService implements OnModuleInit {
    private readonly logger = new Logger(SentryService.name);
    private isConfigured = false;

    constructor(private configService: ConfigService) { }

    onModuleInit() {
        const dsn = this.configService.get<string>('SENTRY_DSN');

        if (dsn) {
            Sentry.init({
                dsn,
                environment: this.configService.get('NODE_ENV') || 'development',
                tracesSampleRate: 1.0,
                integrations: [
                    Sentry.httpIntegration(),
                ],
            });
            this.isConfigured = true;
            this.logger.log('Sentry error tracking initialized');
        } else {
            this.logger.warn('Sentry DSN not configured - errors will be logged only');
        }
    }

    captureException(error: Error, context?: Record<string, any>): string | null {
        this.logger.error(`Error: ${error.message}`, error.stack);

        if (!this.isConfigured) {
            return null;
        }

        if (context) {
            Sentry.setContext('additional', context);
        }

        return Sentry.captureException(error);
    }

    captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): string | null {
        this.logger.log(`[${level.toUpperCase()}] ${message}`);

        if (!this.isConfigured) {
            return null;
        }

        return Sentry.captureMessage(message, level);
    }

    setUser(user: { id: string; email?: string; tenantId?: string }): void {
        if (this.isConfigured) {
            Sentry.setUser({
                id: user.id,
                email: user.email,
                tenant_id: user.tenantId,
            });
        }
    }

    clearUser(): void {
        if (this.isConfigured) {
            Sentry.setUser(null);
        }
    }

    addBreadcrumb(message: string, category?: string, data?: Record<string, any>): void {
        if (this.isConfigured) {
            Sentry.addBreadcrumb({
                message,
                category,
                data,
                level: 'info',
            });
        }
    }
}
