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
      'Public-facing entry point for Liftoff. A SaaS company signs up, ' +
        'its customers are the tenants it provisions, and it can drive that ' +
        'with a company API key and receive a signed webhook when a tenant ' +
        'is ready. `POST /tenants` takes an `Idempotency-Key` header so a ' +
        'retried signup never creates two tenants. Proxies ' +
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
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description:
          'Company API key from POST /api-keys. Accepted on POST /tenants, GET /tenants/:id and the custom step callbacks, also as `Authorization: Bearer lk_…`.',
      },
      'api-key',
    )
    .addTag('Auth', 'Company signup, login, token refresh, profile')
    .addTag('Organisation', 'The signed-up company and its webhook')
    .addTag('API keys', 'Company API keys for server-to-server calls')
    .addTag('Tenants', 'Customer tenants: lifecycle and provisioning state')
    .addTag(
      'Custom steps',
      'Callbacks from your own system for steps set to custom (PUT /organisation { stepConfig })',
    )
    .addTag('Demo', 'The public live demo: one click, no account')
    .addTag('Settings', 'Per-user settings')
    .addTag('Health', 'Liveness probe')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
