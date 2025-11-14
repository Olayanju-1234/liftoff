import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const logger = app.get(Logger);
  logger.log(
    'DB Provisioner worker is running and listening for events...',
  );
}
bootstrap();