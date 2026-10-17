import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalApiClient } from './internal-api.client';

const clientWith = (env: Record<string, string | undefined>) =>
  new InternalApiClient({
    get: (key: string) => env[key],
  } as unknown as ConfigService);

describe('InternalApiClient', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('GETs the billing config with the shared token and a trailing slash trimmed', async () => {
    const client = clientWith({
      TENANT_SERVICE_URL: 'http://tenant:3001/',
      INTERNAL_API_TOKEN: 'tok',
    });
    const body = { configured: true };
    client.fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    }) as unknown as typeof fetch;

    await expect(client.billingConfig('t-1')).resolves.toEqual(body);

    expect(client.fetchImpl).toHaveBeenCalledWith(
      'http://tenant:3001/internal/tenants/t-1/billing',
      expect.objectContaining({ headers: { 'x-internal-token': 'tok' } }),
    );
    expect(client.configured).toBe(true);
  });

  it('throws on a non-2xx answer', async () => {
    const client = clientWith({
      TENANT_SERVICE_URL: 'http://tenant:3001',
      INTERNAL_API_TOKEN: 'tok',
    });
    client.fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
    }) as unknown as typeof fetch;

    await expect(client.billingConfig('t-1')).rejects.toThrow('401');
  });

  it('is unconfigured without the URL or the token, and says so on every call', async () => {
    const client = clientWith({ TENANT_SERVICE_URL: 'http://tenant:3001' });
    expect(client.configured).toBe(false);
    await expect(client.billingConfig('t-1')).rejects.toThrow(
      'INTERNAL_API_TOKEN',
    );
  });
});
