import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TenantsModule } from './tenants/tenants.module';
import { SettingsModule } from './settings/settings.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { EmailModule } from './email/email.module';
import { SentryModule } from './sentry/sentry.module';
import { SentryExceptionFilter } from './sentry/sentry-exception.filter';
import { SentryService } from './sentry/sentry.service';
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== 'production' ? {
          target: 'pino-pretty',
          options: {
            singleLine: true,
            colorize: true,
            levelFirst: false,
          },
        } : undefined,
        level: process.env.LOG_LEVEL || 'info',
      },
    }),
    AuthModule,
    TenantsModule,
    SettingsModule,
    EmailModule,
    SentryModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global JWT guard - all routes protected by default
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global Sentry exception filter
    {
      provide: APP_FILTER,
      useFactory: (sentry: SentryService) => new SentryExceptionFilter(sentry),
      inject: [SentryService],
    },
  ],
})
export class AppModule { }
