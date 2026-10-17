import { envValidationSchema } from './env.validation';

const REQUIRED = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/tenant_db',
  RABBITMQ_URL: 'amqp://user:pass@localhost:5672',
  JWT_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

const validate = (env: Record<string, string>) =>
  envValidationSchema.validate({ ...REQUIRED, ...env }).error;

describe('envValidationSchema email settings', () => {
  it.each([
    'noreply@liftoff.ojusentinel.com',
    'Liftoff <noreply@liftoff.ojusentinel.com>',
  ])('accepts EMAIL_FROM %s', (from) => {
    expect(validate({ EMAIL_FROM: from })).toBeUndefined();
  });

  it.each(['Liftoff', 'Liftoff <noreply>', 'noreply@', '<a@b.com'])(
    'rejects EMAIL_FROM %s',
    (from) => {
      expect(validate({ EMAIL_FROM: from })).toBeDefined();
    },
  );

  it('allows empty provider keys', () => {
    expect(
      validate({ RESEND_API_KEY: '', SENDGRID_API_KEY: '' }),
    ).toBeUndefined();
  });

  it('allows the secrets and internal tokens to be unset, but not short', () => {
    expect(
      validate({ ORG_SECRETS_KEY: '', INTERNAL_API_TOKEN: '' }),
    ).toBeUndefined();
    expect(
      validate({
        ORG_SECRETS_KEY: 'k'.repeat(32),
        INTERNAL_API_TOKEN: 't'.repeat(32),
      }),
    ).toBeUndefined();
    expect(validate({ ORG_SECRETS_KEY: 'short' })).toBeDefined();
    expect(validate({ INTERNAL_API_TOKEN: 'short' })).toBeDefined();
  });
});
