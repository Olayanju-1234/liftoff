import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';

async function bootstrap() {
  const adapter = new FastifyAdapter();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
  );

  app.useLogger(app.get(Logger));

  const fastifyInstance = app.getHttpAdapter().getInstance();
  fastifyInstance.get('/health', () => ({
    status: 'ok',
    service: 'credentials-service',
  }));

  const port = process.env.PORT || 10000;
  // Production sets HOST=127.0.0.1 so only nginx on the same box can reach it.
  await app.listen(port, process.env.HOST || '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(`Credentials Service running on port ${port}`);
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
