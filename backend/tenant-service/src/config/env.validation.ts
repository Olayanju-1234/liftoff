import * as Joi from 'joi';

/**
 * Joi schema enforcing required environment variables at startup.
 * Crash on missing secrets rather than silently signing JWTs with a
 * default fallback string (a previous-life footgun).
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().integer().min(1).max(65_535).default(10_000),
  LOG_LEVEL: Joi.string()
    .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
    .default('info'),

  // Persistence + messaging — both required, no fallbacks.
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  RABBITMQ_URL: Joi.string()
    .uri({ scheme: ['amqp', 'amqps'] })
    .required(),

  // JWT secrets — required and must be non-trivial.
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),

  // CORS / frontend integration.
  FRONTEND_URL: Joi.string().optional().allow(''),
  // The gateway's public address, e.g. https://api.liftoff.ojusentinel.com: custom step
  // requests tell the company's system to call back there. Defaults to localhost:4000.
  PUBLIC_API_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .optional()
    .allow(''),
  // Shown as the tenant address when the organisation has no base domain of its own.
  TENANT_BASE_DOMAIN: Joi.string().hostname().optional().allow(''),

  // Email (optional — Resend, else SendGrid, else nothing is sent).
  RESEND_API_KEY: Joi.string().optional().allow(''),
  SENDGRID_API_KEY: Joi.string().optional().allow(''),
  // A bare address or "Name <address>".
  EMAIL_FROM: Joi.alternatives()
    .try(
      Joi.string().email(),
      Joi.string().pattern(/^[^<>]+<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>$/),
    )
    .optional(),

  // Encrypts per-organisation secrets (Stripe keys) at rest. Without it the company
  // cannot connect Stripe (503) and billing is SKIPPED for everyone.
  ORG_SECRETS_KEY: Joi.string().min(32).optional().allow(''),
  // Derives the public status-page token of every tenant. Falls back to JWT_SECRET;
  // changing whichever is in use invalidates every status link handed out so far.
  STATUS_TOKEN_SECRET: Joi.string().min(32).optional().allow(''),
  // Shared with the workers, which fetch per-organisation config over /internal/*.
  // Without it the internal API answers 503 and billing fails for real tenants.
  INTERNAL_API_TOKEN: Joi.string().min(32).optional().allow(''),

  // Durable deliveries (optional): the HTTP address of a workflowd engine, e.g.
  // http://127.0.0.1:8233. Unset keeps webhook and custom step retries in memory.
  WORKFLOWD_ADDR: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .optional()
    .allow(''),
  // Bearer token: the engine's (--auth-token-file), or the namespace's own.
  WORKFLOWD_TOKEN: Joi.string().optional().allow(''),
  // The workflowd namespace (0.4.0+) every call works in. Unset means default.
  WORKFLOWD_NAMESPACE: Joi.string()
    .pattern(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
    .optional()
    .allow(''),

  // OAuth — optional; routes 401 if a strategy is enabled without creds.
  GOOGLE_CLIENT_ID: Joi.string().optional().allow(''),
  GOOGLE_CLIENT_SECRET: Joi.string().optional().allow(''),
  GITHUB_CLIENT_ID: Joi.string().optional().allow(''),
  GITHUB_CLIENT_SECRET: Joi.string().optional().allow(''),

  // Sentry — optional in dev.
  SENTRY_DSN: Joi.string().uri().optional().allow(''),
}).unknown(true); // tolerate other vars (Render, system, etc.)
