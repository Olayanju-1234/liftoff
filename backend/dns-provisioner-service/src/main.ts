import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const adapter = new FastifyAdapter();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));

  const fastifyInstance = app.getHttpAdapter().getInstance();
  fastifyInstance.get('/health', async () => {
    return { status: 'ok', service: 'dns-provisioner-service', worker: true };
  });

  const port = process.env.PORT || 10000;
  await app.listen(port, '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(
    `DNS Provisioner worker is running on port ${port} and listening for RabbitMQ events...`,
  );
}
bootstrap();