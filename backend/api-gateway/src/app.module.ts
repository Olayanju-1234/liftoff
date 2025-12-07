import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { join } from 'path';
import { existsSync } from 'fs';

// Determine the correct .env file path
const getEnvPath = (): string => {
  const possiblePaths = [
    join(process.cwd(), 'backend', 'api-gateway', '.env'),
    join(process.cwd(), 'apps', 'api-gateway', '.env'),
    join(process.cwd(), '.env'),
    '.env',
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }
  return '.env';
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: getEnvPath(),
    }),
    // Rate limiting: 100 requests per minute per IP
    ThrottlerModule.forRoot([{
      ttl: 60000,  // 1 minute
      limit: 100,   // 100 requests
    }]),
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
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        timeout: 10000,
        baseURL: configService.get<string>('TENANT_SERVICE_URL') || 'http://localhost:3001',
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global rate limiter
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }