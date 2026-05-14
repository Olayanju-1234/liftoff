import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "@fastify/helmet";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";

async function bootstrap() {
  const adapter = new FastifyAdapter();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
  );

  app.useLogger(app.get(Logger));

  // Security: Helmet for HTTP headers
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Swagger UI inlines a small bootstrap script
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // CORS
  const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    ...(process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(",").map((u) => u.trim())
      : []),
  ];
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`), false);
      }
    },
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  });

  // OpenAPI / Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle("TenantOps API Gateway")
    .setDescription(
      "Public-facing entry point for the TenantOps platform. Proxies " +
        "authenticated requests to internal microservices.",
    )
    .setVersion("1.0")
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      "bearer",
    )
    .addTag("Auth", "Registration, login, token refresh, profile")
    .addTag("Tenants", "Tenant lifecycle and provisioning state")
    .addTag("Settings", "Per-user settings")
    .addTag("Health", "Liveness probe")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT || 10000;
  await app.listen(port, "0.0.0.0");

  const logger = app.get(Logger);
  logger.log(`API Gateway is running on port ${port}`);
  logger.log(`OpenAPI docs available at /api/docs`);
}
bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err);
  process.exit(1);
});
