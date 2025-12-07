import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';

async function bootstrap() {
  // Create HTTP server for Render (web service requirement)
  const adapter = new FastifyAdapter();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));

  // Health check endpoint for Render
  const fastifyInstance = app.getHttpAdapter().getInstance();
  fastifyInstance.get('/health', async () => {
    return { status: 'ok', service: 'db-provisioner-service', worker: true };
  });

  // Start HTTP server (required for Render web services)
  const port = process.env.PORT || 3002;
  await app.listen(port, '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(
    `DB Provisioner worker is running on port ${port} and listening for RabbitMQ events...`,
  );
}
bootstrap();