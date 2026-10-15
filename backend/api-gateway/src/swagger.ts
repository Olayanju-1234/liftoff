import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Serving the UI on Fastify needs @fastify/static at runtime, so it is a
// production dependency; the e2e suite calls this to keep that from regressing.
export function setupSwagger(app: NestFastifyApplication): void {
  // Internal-service doc URLs (only the services with HTTP surface; the five
  // worker services are pure RabbitMQ consumers and have no API to document).
  const tenantServiceUrl =
    process.env.TENANT_SERVICE_URL ?? 'http://localhost:3001';

  const swaggerConfig = new DocumentBuilder()
    .setTitle('TenantOps API Gateway')
    .setDescription(
      'Public-facing entry point for the TenantOps platform. Proxies ' +
        'authenticated requests to the internal **tenant-service**, which ' +
        'owns the provisioning state machine and consumes events from five ' +
        'downstream worker services (db-provisioner, dns-provisioner, ' +
        'credentials, billing, notification) over RabbitMQ.\n\n' +
        `**Internal services with their own OpenAPI spec:** [tenant-service](${tenantServiceUrl}/api/docs).\n\n` +
        '**RabbitMQ-only services (no HTTP API):** db-provisioner, ' +
        'dns-provisioner, credentials, billing, notification — see ' +
        '`packages/shared-types` for their event payload contracts.',
    )
    .setVersion('1.0')
    .setExternalDoc('Tenant Service OpenAPI', `${tenantServiceUrl}/api/docs`)
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .addTag('Auth', 'Registration, login, token refresh, profile')
    .addTag('Tenants', 'Tenant lifecycle and provisioning state')
    .addTag('Settings', 'Per-user settings')
    .addTag('Health', 'Liveness probe')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
