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
    jest.clearAllMocks();
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
