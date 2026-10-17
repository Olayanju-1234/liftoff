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
  const apiKey = 'lk_company_key';
  const withApiKey = { headers: { 'x-api-key': apiKey } };

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

      const result = await service.createTenant(dto, { auth: bearer });

      expect(result).toEqual({ id: 'tenant-1', status: 'PROVISIONING' });
      expect(http.post).toHaveBeenCalledWith('/tenants', dto, withAuth);
    });

    it('forwards a company API key on tenant create and get', async () => {
      const dto = { name: 'Acme', subdomain: 'acme', planId: 'starter' };
      http.post.mockReturnValueOnce(ok({ id: 'tenant-1' }));
      http.get.mockReturnValueOnce(ok({ id: 'tenant-1' }));

      await service.createTenant(dto, { apiKey });
      await service.getTenant('tenant-1', { auth: undefined, apiKey });

      expect(http.post).toHaveBeenCalledWith('/tenants', dto, withApiKey);
      expect(http.get).toHaveBeenCalledWith('/tenants/tenant-1', withApiKey);
    });

    it('forwards both headers when a caller sends both', async () => {
      http.get.mockReturnValueOnce(ok({ id: 'tenant-1' }));

      await service.getTenant('tenant-1', { auth: bearer, apiKey });

      expect(http.get).toHaveBeenCalledWith('/tenants/tenant-1', {
        headers: { Authorization: bearer, 'x-api-key': apiKey },
      });
    });

    it('proxies the organisation and API key routes with the user token only', async () => {
      http.get.mockReturnValue(ok([]));
      http.put.mockReturnValueOnce(ok({ webhookSecret: 'whsec_x' }));
      http.post.mockReturnValueOnce(ok({ key: 'lk_new' }));
      http.delete.mockReturnValueOnce(ok(undefined));

      await service.getOrganisation(bearer);
      await service.updateOrganisation(
        { webhookUrl: 'https://h.acme.com/x' },
        bearer,
      );
      await service.createApiKey({ name: 'CI' }, bearer);
      await service.listApiKeys(bearer);
      await service.revokeApiKey('key-1', bearer);

      expect(http.get).toHaveBeenCalledWith('/organisation', withAuth);
      expect(http.put).toHaveBeenCalledWith(
        '/organisation',
        { webhookUrl: 'https://h.acme.com/x' },
        withAuth,
      );
      expect(http.post).toHaveBeenCalledWith(
        '/api-keys',
        { name: 'CI' },
        withAuth,
      );
      expect(http.get).toHaveBeenCalledWith('/api-keys', withAuth);
      expect(http.delete).toHaveBeenCalledWith('/api-keys/key-1', withAuth);
    });

    it('sends GET and DELETE without a body', async () => {
      http.get.mockReturnValueOnce(ok({ id: 'tenant-1' }));
      http.delete.mockReturnValueOnce(ok({ deleted: true }));

      await service.getTenant('tenant-1', { auth: bearer });
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

    it('posts email confirmations without an auth header', async () => {
      const dto = { token: 'abc' };
      http.post.mockReturnValueOnce(ok({ id: 'user-1', email: 'new@x.io' }));

      await service.confirmEmailChange(dto);

      expect(http.post).toHaveBeenCalledWith(
        '/settings/email/confirm',
        dto,
        {},
      );
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
          { auth: bearer },
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
