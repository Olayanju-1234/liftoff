import * as Joi from 'joi';

/**
 * Joi schema enforcing required environment variables at startup.
 * Fail-fast: a missing TENANT_SERVICE_URL crashes boot rather than
 * generating cryptic 5xxs on every downstream call.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().integer().min(1).max(65_535).default(10_000),
  LOG_LEVEL: Joi.string()
    .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
    .default('info'),

  // Downstream service the gateway proxies to.
  TENANT_SERVICE_URL: Joi.string().uri().required(),

  // Comma-separated list of allowed CORS origins (in addition to localhost).
  FRONTEND_URL: Joi.string().optional().allow(''),
});
