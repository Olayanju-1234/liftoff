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

  it('GETs the notification details with the shared token', async () => {
    const client = clientWith({
      TENANT_SERVICE_URL: 'http://tenant:3001/',
      INTERNAL_API_TOKEN: 'tok',
    });
    const body = { recipients: { ready: ['a@b.c'], attention: [] } };
    client.fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    }) as unknown as typeof fetch;

    await expect(client.notificationDetails('t-1')).resolves.toEqual(body);
    expect(client.fetchImpl).toHaveBeenCalledWith(
      'http://tenant:3001/internal/tenants/t-1/notification',
      expect.objectContaining({ headers: { 'x-internal-token': 'tok' } }),
    );
  });

  it('throws on a non-2xx answer and when unconfigured', async () => {
    const client = clientWith({
      TENANT_SERVICE_URL: 'http://tenant:3001',
      INTERNAL_API_TOKEN: 'tok',
    });
    client.fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as unknown as typeof fetch;
    await expect(client.notificationDetails('t-1')).rejects.toThrow('404');

    const unconfigured = clientWith({});
    expect(unconfigured.configured).toBe(false);
    await expect(unconfigured.notificationDetails('t-1')).rejects.toThrow(
      'TENANT_SERVICE_URL',
    );
  });
});
