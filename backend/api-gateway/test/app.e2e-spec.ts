import { HttpService } from '@nestjs/axios';
import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AxiosError, AxiosHeaders } from 'axios';
import { of, throwError } from 'rxjs';

import { AppModule } from '../src/app.module';

const unauthorized = () => {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, {
    status: 401,
    statusText: 'Unauthorized',
    data: { statusCode: 401, message: 'Unauthorized' },
    headers: {},
    config,
  });
};

describe('API Gateway (e2e)', () => {
  let app: NestFastifyApplication;
  const http = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(HttpService)
      .useValue(http)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    // Same pipe as main.ts, so request validation matches production.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health answers without calling tenant-service', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ status: string }>().status).toBe('ok');
    expect(http.get).not.toHaveBeenCalled();
  });

  it('GET /auth/me forwards the Authorization header to tenant-service', async () => {
    const profile = { id: 'user-1', email: 'admin@acme.com' };
    http.get.mockReturnValueOnce(of({ data: profile }));

    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: 'Bearer user.jwt.token' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<typeof profile>()).toEqual(profile);
    expect(http.get).toHaveBeenCalledWith('/auth/me', {
      headers: { Authorization: 'Bearer user.jwt.token' },
    });
  });

  it('POST /auth/login rejects an invalid body before proxying', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'not-an-email', password: 'x' },
    });

    expect(res.statusCode).toBe(400);
    expect(http.post).not.toHaveBeenCalled();
  });

  describe('tenant id routes', () => {
    // Real id from tenant-service's @default(cuid()).
    const tenantId = 'cmv9gs7040002vyzf6leznb2s';
    const headers = { authorization: 'Bearer user.jwt.token' };
    const forwarded = { headers: { Authorization: 'Bearer user.jwt.token' } };

    it.each([
      ['GET', `/tenants/${tenantId}`, 'get'],
      ['GET', `/tenants/${tenantId}/events`, 'get'],
      ['DELETE', `/tenants/${tenantId}`, 'delete'],
    ] as const)('%s %s proxies a cuid', async (method, url, verb) => {
      http[verb].mockReturnValueOnce(of({ data: { id: tenantId } }));

      const res = await app.inject({ method, url, headers });

      expect(res.statusCode).toBe(200);
      expect(http[verb]).toHaveBeenCalledWith(url, forwarded);
    });

    it('POST /tenants/:id/cancel proxies a cuid with the body', async () => {
      http.post.mockReturnValueOnce(of({ data: { id: tenantId } }));

      const res = await app.inject({
        method: 'POST',
        url: `/tenants/${tenantId}/cancel`,
        headers,
        payload: { reason: 'Customer changed plan' },
      });

      expect(res.statusCode).toBe(201);
      expect(http.post).toHaveBeenCalledWith(
        `/tenants/${tenantId}/cancel`,
        { reason: 'Customer changed plan' },
        forwarded,
      );
    });

    it.each([
      ['GET', '/tenants/3f2b8c1e-9a4d-4e7b-8c2f-1d5e6a7b8c9d'],
      ['GET', '/tenants/..%2Fsettings'],
      ['GET', '/tenants/..%2F..%2Fauth%2Fme/events'],
      ['DELETE', `/tenants/${tenantId}%3Fforce%3Dtrue`],
      ['POST', `/tenants/${tenantId.toUpperCase()}/cancel`],
    ] as const)('%s %s is rejected before proxying', async (method, url) => {
      const payload = method === 'POST' ? {} : undefined;
      const res = await app.inject({ method, url, headers, payload });

      expect(res.statusCode).toBe(400);
      expect(res.json<{ message: string }>().message).toBe(
        'Validation failed (cuid is expected)',
      );
      expect(http.get).not.toHaveBeenCalled();
      expect(http.post).not.toHaveBeenCalled();
      expect(http.delete).not.toHaveBeenCalled();
    });
  });

  it('passes a downstream 401 back to the client', async () => {
    http.get.mockReturnValueOnce(throwError(unauthorized));

    const res = await app.inject({
      method: 'GET',
      url: '/settings',
      headers: { authorization: 'Bearer expired.jwt.token' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json<{ message: string }>().message).toBe('Unauthorized');
  });
});
