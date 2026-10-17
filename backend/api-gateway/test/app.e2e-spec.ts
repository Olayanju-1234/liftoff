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
import { setupSwagger } from '../src/swagger';

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
    setupSwagger(app);
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

  it('GET /api/docs serves the Swagger UI and its static assets', async () => {
    const page = await app.inject({ method: 'GET', url: '/api/docs' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');

    // The bundle is served by @fastify/static, which must be installed at runtime.
    const bundle = await app.inject({
      method: 'GET',
      url: '/api/docs/swagger-ui-bundle.js',
    });
    expect(bundle.statusCode).toBe(200);
  });

  it('GET /api/docs-json serves the OpenAPI document', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/docs-json' });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ info: { title: string } }>().info.title).toBe(
      'TenantOps API Gateway',
    );
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

  describe('email verification and password reset', () => {
    it('POST /auth/forgot-password validates the email, then proxies without auth', async () => {
      const bad = await app.inject({
        method: 'POST',
        url: '/auth/forgot-password',
        payload: { email: 'nope' },
      });
      expect(bad.statusCode).toBe(400);
      expect(http.post).not.toHaveBeenCalled();

      http.post.mockReturnValueOnce(of({ data: { message: 'If…' } }));
      const ok = await app.inject({
        method: 'POST',
        url: '/auth/forgot-password',
        payload: { email: 'admin@acme.com' },
      });
      expect(ok.statusCode).toBe(200);
      expect(http.post).toHaveBeenCalledWith(
        '/auth/forgot-password',
        { email: 'admin@acme.com' },
        {},
      );
    });

    it('POST /auth/reset-password enforces the password rules before proxying', async () => {
      const short = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        payload: { token: 't', password: 'short' },
      });
      expect(short.statusCode).toBe(400);

      http.post.mockReturnValueOnce(of({ data: { message: 'done' } }));
      const ok = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        payload: { token: 'tok_123', password: 'CorrectHorse9!' },
      });
      expect(ok.statusCode).toBe(200);
      expect(http.post).toHaveBeenCalledWith(
        '/auth/reset-password',
        { token: 'tok_123', password: 'CorrectHorse9!' },
        {},
      );
    });

    it('POST /auth/verify-email proxies the token and /auth/resend-verification the user token', async () => {
      http.post
        .mockReturnValueOnce(
          of({ data: { id: 'u1', email: 'a@b.c', emailVerified: true } }),
        )
        .mockReturnValueOnce(of({ data: { message: 'sent' } }));

      const verified = await app.inject({
        method: 'POST',
        url: '/auth/verify-email',
        payload: { token: 'tok_123' },
      });
      const resent = await app.inject({
        method: 'POST',
        url: '/auth/resend-verification',
        headers: { authorization: 'Bearer user.jwt.token' },
      });

      expect(verified.statusCode).toBe(200);
      expect(verified.json<{ emailVerified: boolean }>().emailVerified).toBe(
        true,
      );
      expect(resent.statusCode).toBe(200);
      expect(http.post).toHaveBeenLastCalledWith(
        '/auth/resend-verification',
        {},
        { headers: { Authorization: 'Bearer user.jwt.token' } },
      );
    });
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

    it('POST /tenants/:id/retry proxies with the user token and answers 200', async () => {
      http.post.mockReturnValueOnce(
        of({ data: { id: tenantId, status: 'PROVISIONING' } }),
      );

      const res = await app.inject({
        method: 'POST',
        url: `/tenants/${tenantId}/retry`,
        headers,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ id: tenantId, status: 'PROVISIONING' });
      expect(http.post).toHaveBeenCalledWith(
        `/tenants/${tenantId}/retry`,
        {},
        forwarded,
      );
    });

    it.each([
      ['GET', '/tenants/3f2b8c1e-9a4d-4e7b-8c2f-1d5e6a7b8c9d'],
      ['GET', '/tenants/..%2Fsettings'],
      ['GET', '/tenants/..%2F..%2Fauth%2Fme/events'],
      ['DELETE', `/tenants/${tenantId}%3Fforce%3Dtrue`],
      ['POST', `/tenants/${tenantId.toUpperCase()}/cancel`],
      ['POST', '/tenants/..%2Fsettings/retry'],
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

  describe('customer plans on PUT /organisation', () => {
    const headers = { authorization: 'Bearer user.jwt.token' };

    it('proxies a valid plan list with prices, lowercasing and trimming ids', async () => {
      http.put.mockReturnValueOnce(of({ data: { id: 'org-1' } }));

      const res = await app.inject({
        method: 'PUT',
        url: '/organisation',
        headers,
        payload: {
          plans: [
            {
              id: ' Growth ',
              name: 'Growth',
              description: 'For teams of 10 to 50',
            },
            { id: 'scale', name: ' Scale ' },
          ],
          stripePrices: { growth: 'price_1Qabcdefgh', scale: null },
        },
      });

      expect(res.statusCode).toBe(200);
      const [[, body]] = http.put.mock.calls as [[string, unknown]];
      expect(body).toEqual({
        plans: [
          {
            id: 'growth',
            name: 'Growth',
            description: 'For teams of 10 to 50',
          },
          { id: 'scale', name: 'Scale' },
        ],
        stripePrices: { growth: 'price_1Qabcdefgh', scale: null },
      });
    });

    it.each([
      ['an empty list', { plans: [] }],
      ['a bad id', { plans: [{ id: 'Not Valid', name: 'x' }] }],
      ['a missing name', { plans: [{ id: 'growth' }] }],
      [
        'duplicate ids',
        {
          plans: [
            { id: 'a', name: 'A' },
            { id: 'A', name: 'B' },
          ],
        },
      ],
      [
        'an unknown plan field',
        { plans: [{ id: 'a', name: 'A', price: 'x' }] },
      ],
      ['a bad price', { stripePrices: { growth: 'not-a-price' } }],
      ['a bad price key', { stripePrices: { 'Bad Key': 'price_1Qabcdefgh' } }],
    ])('rejects %s with 400 before proxying', async (_what, payload) => {
      const res = await app.inject({
        method: 'PUT',
        url: '/organisation',
        headers,
        payload,
      });

      expect(res.statusCode).toBe(400);
      expect(http.put).not.toHaveBeenCalled();
    });

    it('proxies plans: null (back to the defaults)', async () => {
      http.put.mockReturnValueOnce(of({ data: { id: 'org-1' } }));

      const res = await app.inject({
        method: 'PUT',
        url: '/organisation',
        headers,
        payload: { plans: null },
      });

      expect(res.statusCode).toBe(200);
      expect(http.put).toHaveBeenCalledWith(
        '/organisation',
        { plans: null },
        { headers: { Authorization: 'Bearer user.jwt.token' } },
      );
    });
  });

  describe('step config on PUT /organisation', () => {
    const headers = { authorization: 'Bearer user.jwt.token' };

    it('proxies per-step modes, URLs and timeouts, and null to reset a step', async () => {
      http.put.mockReturnValueOnce(of({ data: { id: 'org-1' } }));

      const res = await app.inject({
        method: 'PUT',
        url: '/organisation',
        headers,
        payload: {
          stepConfig: {
            database: {
              mode: 'custom',
              url: 'https://steps.acme.com/db',
              timeoutMs: 120000,
            },
            billing: { mode: 'skipped' },
            welcome: null,
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const [[, body]] = http.put.mock.calls as [[string, unknown]];
      expect(JSON.parse(JSON.stringify(body))).toEqual({
        stepConfig: {
          database: {
            mode: 'custom',
            url: 'https://steps.acme.com/db',
            timeoutMs: 120000,
          },
          billing: { mode: 'skipped' },
          welcome: null,
        },
      });
    });

    it('proxies stepConfig: null (every step back to builtin)', async () => {
      http.put.mockReturnValueOnce(of({ data: { id: 'org-1' } }));

      const res = await app.inject({
        method: 'PUT',
        url: '/organisation',
        headers,
        payload: { stepConfig: null },
      });

      expect(res.statusCode).toBe(200);
      expect(http.put).toHaveBeenCalledWith(
        '/organisation',
        { stepConfig: null },
        { headers: { Authorization: 'Bearer user.jwt.token' } },
      );
    });

    it.each([
      ['an unknown step', { stepConfig: { dns: { mode: 'skipped' } } }],
      ['an unknown mode', { stepConfig: { database: { mode: 'manual' } } }],
      ['a missing mode', { stepConfig: { database: { url: 'https://a.io' } } }],
      [
        'a URL without a scheme',
        { stepConfig: { database: { mode: 'custom', url: 'steps.acme.com' } } },
      ],
      [
        'a timeout under a minute',
        {
          stepConfig: {
            billing: {
              mode: 'custom',
              url: 'https://a.io/x',
              timeoutMs: 5000,
            },
          },
        },
      ],
      [
        'a timeout over a day',
        {
          stepConfig: {
            billing: {
              mode: 'custom',
              url: 'https://a.io/x',
              timeoutMs: 86_400_001,
            },
          },
        },
      ],
      [
        'an unknown entry field',
        { stepConfig: { welcome: { mode: 'skipped', secret: 'x' } } },
      ],
      ['a non-object', { stepConfig: 'custom' }],
    ])('rejects %s with 400 before proxying', async (_what, payload) => {
      const res = await app.inject({
        method: 'PUT',
        url: '/organisation',
        headers,
        payload,
      });

      expect(res.statusCode).toBe(400);
      expect(http.put).not.toHaveBeenCalled();
    });
  });

  describe('public status page', () => {
    const token = 'A'.repeat(43);

    it('GET /status/:token proxies without any credentials', async () => {
      const status = { company: 'Acme', name: 'Globex', state: 'setting-up' };
      http.get.mockReturnValueOnce(of({ data: status }));

      const res = await app.inject({ method: 'GET', url: `/status/${token}` });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(status);
      expect(http.get).toHaveBeenCalledWith(`/status/${token}`, {});
    });

    it.each([
      'short',
      'A'.repeat(42),
      'A'.repeat(44),
      `${'A'.repeat(42)}=`,
      `${'A'.repeat(40)}%2F..`,
    ])('GET /status/%s answers 404 without proxying', async (bad) => {
      const res = await app.inject({ method: 'GET', url: `/status/${bad}` });

      expect(res.statusCode).toBe(404);
      expect(http.get).not.toHaveBeenCalled();
    });

    it("passes tenant-service's 404 for an unknown token through", async () => {
      const config = { headers: new AxiosHeaders() };
      http.get.mockReturnValueOnce(
        throwError(
          () =>
            new AxiosError('Not found', 'ERR_BAD_REQUEST', config, null, {
              status: 404,
              statusText: 'Not Found',
              data: { statusCode: 404, message: 'No setup matches this link' },
              headers: {},
              config,
            }),
        ),
      );

      const res = await app.inject({ method: 'GET', url: `/status/${token}` });

      expect(res.statusCode).toBe(404);
      expect(res.json<{ message: string }>().message).toBe(
        'No setup matches this link',
      );
    });
  });

  describe('company API keys', () => {
    const tenantId = 'cmv9gs7040002vyzf6leznb2s';

    it('POST /tenants forwards x-api-key without an Authorization header', async () => {
      http.post.mockReturnValueOnce(of({ data: { id: tenantId } }));

      const res = await app.inject({
        method: 'POST',
        url: '/tenants',
        headers: { 'x-api-key': 'lk_company_key' },
        payload: { name: 'Globex', subdomain: 'globex', planId: 'starter' },
      });

      expect(res.statusCode).toBe(202);
      expect(http.post).toHaveBeenCalledWith(
        '/tenants',
        { name: 'Globex', subdomain: 'globex', planId: 'starter' },
        { headers: { 'x-api-key': 'lk_company_key' } },
      );
    });

    it('POST /tenants forwards Idempotency-Key and passes Idempotent-Replayed back', async () => {
      http.post.mockReturnValueOnce(
        of({
          data: { id: tenantId },
          headers: { 'idempotent-replayed': 'true' },
        }),
      );

      const res = await app.inject({
        method: 'POST',
        url: '/tenants',
        headers: {
          'x-api-key': 'lk_company_key',
          'idempotency-key': 'signup-42',
        },
        payload: { name: 'Globex', subdomain: 'globex', planId: 'starter' },
      });

      expect(res.statusCode).toBe(202);
      expect(res.headers['idempotent-replayed']).toBe('true');
      expect(http.post).toHaveBeenCalledWith(
        '/tenants',
        { name: 'Globex', subdomain: 'globex', planId: 'starter' },
        {
          headers: {
            'x-api-key': 'lk_company_key',
            'idempotency-key': 'signup-42',
          },
        },
      );
    });

    it('passes a downstream 422 (key reused with another body) and its headers through', async () => {
      const config = { headers: new AxiosHeaders() };
      http.post.mockReturnValueOnce(
        throwError(
          () =>
            new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, {
              status: 422,
              statusText: 'Unprocessable Entity',
              data: { statusCode: 422, message: 'Idempotency-Key reused' },
              headers: { 'retry-after': '30' },
              config,
            }),
        ),
      );

      const res = await app.inject({
        method: 'POST',
        url: '/tenants',
        headers: {
          'x-api-key': 'lk_company_key',
          'idempotency-key': 'signup-42',
        },
        payload: { name: 'Other', subdomain: 'other', planId: 'starter' },
      });

      expect(res.statusCode).toBe(422);
      expect(res.json<{ message: string }>().message).toBe(
        'Idempotency-Key reused',
      );
      expect(res.headers['retry-after']).toBe('30');
    });

    it('GET /tenants/:id forwards a key sent as a bearer token verbatim', async () => {
      http.get.mockReturnValueOnce(of({ data: { id: tenantId } }));

      const res = await app.inject({
        method: 'GET',
        url: `/tenants/${tenantId}`,
        headers: { authorization: 'Bearer lk_company_key' },
      });

      expect(res.statusCode).toBe(200);
      expect(http.get).toHaveBeenCalledWith(`/tenants/${tenantId}`, {
        headers: { Authorization: 'Bearer lk_company_key' },
      });
    });

    it('POST /api-keys proxies with the user token and DELETE answers 204', async () => {
      http.post.mockReturnValueOnce(
        of({ data: { id: 'key-1', key: 'lk_new', prefix: 'lk_new' } }),
      );
      http.delete.mockReturnValueOnce(of({ data: undefined }));

      const created = await app.inject({
        method: 'POST',
        url: '/api-keys',
        headers: { authorization: 'Bearer user.jwt.token' },
        payload: { name: 'CI' },
      });
      const revoked = await app.inject({
        method: 'DELETE',
        url: `/api-keys/${tenantId}`,
        headers: { authorization: 'Bearer user.jwt.token' },
      });

      expect(created.statusCode).toBe(201);
      expect(created.json<{ key: string }>().key).toBe('lk_new');
      expect(revoked.statusCode).toBe(204);
      expect(http.delete).toHaveBeenCalledWith(`/api-keys/${tenantId}`, {
        headers: { Authorization: 'Bearer user.jwt.token' },
      });
    });

    it('PUT /organisation rejects an unknown field before proxying', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/organisation',
        headers: { authorization: 'Bearer user.jwt.token' },
        payload: { webhookSecret: 'whsec_mine' },
      });

      expect(res.statusCode).toBe(400);
      expect(http.put).not.toHaveBeenCalled();
    });

    it('POST /auth/register accepts companyName + handle and still the older tenantName + subdomain', async () => {
      http.post.mockReturnValue(of({ data: { accessToken: 'a' } }));

      const modern = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'admin@acme.com',
          password: 'CorrectHorse9!',
          companyName: 'Acme',
          handle: 'acme',
        },
      });
      const legacy = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'admin@globex.com',
          password: 'CorrectHorse9!',
          tenantName: 'Globex',
          subdomain: 'globex',
        },
      });
      const neither = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'x@y.io', password: 'CorrectHorse9!' },
      });
      const badHandle = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'x@y.io',
          password: 'CorrectHorse9!',
          companyName: 'X',
          handle: 'Not A Handle',
        },
      });

      expect(modern.statusCode).toBe(201);
      expect(legacy.statusCode).toBe(201);
      expect(neither.statusCode).toBe(400);
      expect(badHandle.statusCode).toBe(400);
      expect(http.post).toHaveBeenCalledTimes(2);
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
