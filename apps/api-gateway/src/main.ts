import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common'; // Import ValidationPipe

async function bootstrap() {
  const adapter = new FastifyAdapter();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
  );

  // Enable validation for any DTOs this gateway might use
  app.useGlobalPipes(new ValidationPipe());

  // Run the gateway on port 3000
  await app.listen(3000, '0.0.0.0');
  console.log(`ApiGateway is running on: ${await app.getUrl()}`);
}
bootstrap();