import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const adapter = new FastifyAdapter();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
  );

  app.useGlobalPipes(new ValidationPipe());

  await app.listen(3001, '0.0.0.0');
  console.log(`TenantService is running on: ${await app.getUrl()}`);
}
bootstrap();