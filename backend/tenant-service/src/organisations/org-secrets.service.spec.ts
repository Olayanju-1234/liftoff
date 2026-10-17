import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrgSecretsService } from './org-secrets.service';

const withKey = (key?: string) =>
  new OrgSecretsService({
    get: () => key,
  } as unknown as ConfigService);

describe('OrgSecretsService', () => {
  const service = withKey('x'.repeat(40));

  it('round-trips a secret and never stores it in the clear', () => {
    const blob = service.encrypt('sk_test_abcdefghijklmnop');

    expect(blob).toMatch(
      /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    );
    expect(blob).not.toContain('sk_test');
    expect(service.decrypt(blob)).toBe('sk_test_abcdefghijklmnop');
  });

  it('uses a fresh IV per call, so equal secrets encrypt differently', () => {
    expect(service.encrypt('same')).not.toBe(service.encrypt('same'));
  });

  it('rejects a tampered or foreign blob', () => {
    const blob = service.encrypt('sk_test_abcdefghijklmnop');
    const [v, iv, tag, ct] = blob.split('.');
    const flipped = ct[0] === 'A' ? 'B' : 'A';
    expect(() =>
      service.decrypt([v, iv, tag, flipped + ct.slice(1)].join('.')),
    ).toThrow();
    expect(() => withKey('y'.repeat(40)).decrypt(blob)).toThrow();
    expect(() => service.decrypt('v0.a.b.c')).toThrow('not in a known format');
  });

  it('is disabled without ORG_SECRETS_KEY and answers 503 instead of storing', () => {
    const disabled = withKey(undefined);
    expect(disabled.enabled).toBe(false);
    expect(service.enabled).toBe(true);
    expect(() => disabled.encrypt('x')).toThrow(ServiceUnavailableException);
    expect(() => disabled.decrypt('v1.a.b.c')).toThrow(
      ServiceUnavailableException,
    );
  });
});
