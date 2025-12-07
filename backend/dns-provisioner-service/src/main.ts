import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
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
  );

  // Health check endpoint for Render
  const fastifyInstance = app.getHttpAdapter().getInstance();
  fastifyInstance.get('/health', async () => {
    return { status: 'ok', service: 'dns-provisioner-service', worker: true };
  });

  // Start HTTP server (required for Render web services)
  const port = process.env.PORT || 3003;
  await app.listen(port, '0.0.0.0');

  console.log(
    `DNS Provisioner worker is running on port ${port} and listening for RabbitMQ events...`,
  );
}
bootstrap();