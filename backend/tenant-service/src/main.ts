import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const adapter = new FastifyAdapter();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));
  app.useGlobalPipes(new ValidationPipe());

  // Health check endpoint
  const fastifyInstance = app.getHttpAdapter().getInstance();
  fastifyInstance.get('/health', async () => {
    return { status: 'ok', service: 'tenant-service' };
  });

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(`Tenant Service is running on port ${port}`);
}
bootstrap();