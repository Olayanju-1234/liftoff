import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TenantsModule } from './tenants/tenants.module';
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
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
    TenantsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }