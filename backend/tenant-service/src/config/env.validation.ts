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
  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
  RABBITMQ_URL: Joi.string().uri({ scheme: ['amqp', 'amqps'] }).required(),

  // JWT secrets — required and must be non-trivial.
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),

  // CORS / frontend integration.
  FRONTEND_URL: Joi.string().optional().allow(''),

  // Email (optional — service degrades to log-only when missing).
  SENDGRID_API_KEY: Joi.string().optional().allow(''),
  EMAIL_FROM: Joi.string().email().optional(),

  // OAuth — optional; routes 401 if a strategy is enabled without creds.
  GOOGLE_CLIENT_ID: Joi.string().optional().allow(''),
  GOOGLE_CLIENT_SECRET: Joi.string().optional().allow(''),
  GITHUB_CLIENT_ID: Joi.string().optional().allow(''),
  GITHUB_CLIENT_SECRET: Joi.string().optional().allow(''),

  // Sentry — optional in dev.
  SENTRY_DSN: Joi.string().uri().optional().allow(''),
}).unknown(true); // tolerate other vars (Render, system, etc.)
