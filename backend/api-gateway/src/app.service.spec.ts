import { HttpService } from '@nestjs/axios';
import {
  HttpException,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AxiosError, AxiosHeaders, AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';

import { AppService } from './app.service';

type MockHttp = {
  get: jest.Mock;
  post: jest.Mock;
  put: jest.Mock;
  delete: jest.Mock;
};

const ok = <T>(data: T) => of({ data });

const downstreamError = (status: number, data: unknown) => {
  const config = { headers: new AxiosHeaders() };
  const response: AxiosResponse = {
    status,
    statusText: '',
    data,
    headers: {},
    config,
  };
  return new AxiosError(
    'Request failed',
    'ERR_BAD_RESPONSE',
    config,
    null,
    response,
  );
};

const rejectionOf = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the promise to reject');
};

describe('AppService', () => {
  let service: AppService;
  let http: MockHttp;

  const bearer = 'Bearer user.jwt.token';
  const withAuth = { headers: { Authorization: bearer } };

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    http = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [AppService, { provide: HttpService, useValue: http }],
    }).compile();

    service = moduleRef.get(AppService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('proxying', () => {
    it('posts login credentials to tenant-service without an auth header', async () => {
      const dto = { email: 'admin@acme.com', password: 'CorrectHorse9!' };
      http.post.mockReturnValueOnce(ok({ accessToken: 'a' }));

      await expect(service.login(dto)).resolves.toEqual({ accessToken: 'a' });
      expect(http.post).toHaveBeenCalledWith('/auth/login', dto, {});
    });

    it('returns the downstream body for a tenant create', async () => {
      const dto = { name: 'Acme', subdomain: 'acme', planId: 'starter' };
      http.post.mockReturnValueOnce(
        ok({ id: 'tenant-1', status: 'PROVISIONING' }),
      );

      const result = await service.createTenant(dto, bearer);

      expect(result).toEqual({ id: 'tenant-1', status: 'PROVISIONING' });
      expect(http.post).toHaveBeenCalledWith('/tenants', dto, withAuth);
    });

    it('sends GET and DELETE without a body', async () => {
      http.get.mockReturnValueOnce(ok({ id: 'tenant-1' }));
      http.delete.mockReturnValueOnce(ok({ deleted: true }));

      await service.getTenant('tenant-1', bearer);
      await service.deleteTenant('tenant-1', bearer);

      expect(http.get).toHaveBeenCalledWith('/tenants/tenant-1', withAuth);
      expect(http.delete).toHaveBeenCalledWith('/tenants/tenant-1', withAuth);
    });

    it('sends settings updates as PUT', async () => {
      const dto = { firstName: 'Jane' };
      http.put.mockReturnValueOnce(ok(dto));

      await service.updateSettings(dto, bearer);

      expect(http.put).toHaveBeenCalledWith('/settings', dto, withAuth);
    });
  });

  describe('auth header forwarding', () => {
    it('forwards the caller bearer token verbatim', async () => {
      http.get.mockReturnValueOnce(ok({ id: 'user-1' }));

      await service.getProfile(bearer);

      expect(http.get).toHaveBeenCalledWith('/auth/me', withAuth);
    });

    it('forwards the token on logout alongside an empty body', async () => {
      http.post.mockReturnValueOnce(ok({ message: 'Logged out successfully' }));

      await service.logout(bearer);

      expect(http.post).toHaveBeenCalledWith('/auth/logout', {}, withAuth);
    });

    it('omits the Authorization header when the caller sent none', async () => {
      http.get.mockReturnValueOnce(ok([]));

      await service.getTenants(undefined);

      expect(http.get).toHaveBeenCalledWith('/tenants', {});
    });
  });

  describe('error mapping', () => {
    it('passes a downstream 4xx through with its status and body', async () => {
      const body = { statusCode: 409, message: 'Subdomain already taken' };
      http.post.mockReturnValueOnce(
        throwError(() => downstreamError(409, body)),
      );

      const error = await rejectionOf(
        service.createTenant(
          { name: 'Acme', subdomain: 'acme', planId: 'starter' },
          bearer,
        ),
      );

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
      expect((error as HttpException).getResponse()).toEqual(body);
    });

    it('hides a downstream 5xx behind 503', async () => {
      http.get.mockReturnValueOnce(
        throwError(() => downstreamError(500, { stack: 'internal detail' })),
      );

      const error = await rejectionOf(service.getSettings(bearer));

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as HttpException).getResponse()).not.toEqual(
        expect.objectContaining({ stack: 'internal detail' }),
      );
    });

    it('maps a network failure with no response to 503', async () => {
      http.get.mockReturnValueOnce(
        throwError(
          () => new AxiosError('connect ECONNREFUSED', 'ECONNREFUSED'),
        ),
      );

      await expect(service.getEvents(bearer)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('maps a non-axios failure to 500', async () => {
      http.get.mockReturnValueOnce(throwError(() => new TypeError('boom')));

      const error = await rejectionOf(
        service.getTenantEvents('tenant-1', bearer),
      );

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    });
  });
});
