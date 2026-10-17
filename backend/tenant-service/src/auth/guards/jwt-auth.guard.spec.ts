import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { JwtAuthGuard } from './jwt-auth.guard';
import { ApiKeysService } from '../../organisations/api-keys.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_API_KEY } from '../decorators/allow-api-key.decorator';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let apiKeys: { authenticate: jest.Mock };
  let metadata: Record<string, boolean>;
  let passportCanActivate: jest.SpyInstance;

  const principal = {
    kind: 'api-key',
    apiKeyId: 'k1',
    organisationId: 'org-1',
  };

  const context = (headers: Record<string, string>) => {
    const request: { headers: Record<string, string>; user?: unknown } = {
      headers,
    };
    return {
      request,
      ctx: {
        getType: () => 'http',
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext,
    };
  };

  beforeEach(() => {
    metadata = {};
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => metadata[key]),
    } as unknown as Reflector;
    apiKeys = { authenticate: jest.fn().mockResolvedValue(principal) };
    guard = new JwtAuthGuard(reflector, apiKeys as unknown as ApiKeysService);
    // The passport path is covered by passport itself; only what we route to it matters here.
    const passportGuard = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
      canActivate: (ctx: ExecutionContext) => Promise<boolean>;
    };
    passportCanActivate = jest
      .spyOn(passportGuard, 'canActivate')
      .mockResolvedValue(true);
  });

  afterEach(() => jest.restoreAllMocks());

  it('lets public routes through without looking at credentials', async () => {
    metadata[IS_PUBLIC_KEY] = true;
    const { ctx } = context({ 'x-api-key': 'lk_anything' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(apiKeys.authenticate).not.toHaveBeenCalled();
    expect(passportCanActivate).not.toHaveBeenCalled();
  });

  it('resolves x-api-key to the organisation on a route that allows keys', async () => {
    metadata[ALLOW_API_KEY] = true;
    const { ctx, request } = context({ 'x-api-key': 'lk_secret' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(apiKeys.authenticate).toHaveBeenCalledWith('lk_secret');
    expect(request.user).toEqual(principal);
    expect(passportCanActivate).not.toHaveBeenCalled();
  });

  it('accepts the key as a bearer token too', async () => {
    metadata[ALLOW_API_KEY] = true;
    const { ctx, request } = context({ authorization: 'Bearer lk_secret' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(apiKeys.authenticate).toHaveBeenCalledWith('lk_secret');
    expect(request.user).toEqual(principal);
  });

  it('rejects an API key on a route that needs a signed-in user', async () => {
    const { ctx } = context({ 'x-api-key': 'lk_secret' });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(apiKeys.authenticate).not.toHaveBeenCalled();
  });

  it('passes an invalid key failure (401) through', async () => {
    metadata[ALLOW_API_KEY] = true;
    apiKeys.authenticate.mockRejectedValueOnce(
      new UnauthorizedException('Invalid API key'),
    );
    const { ctx } = context({ 'x-api-key': 'lk_wrong' });

    await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid API key');
  });

  it('sends a JWT bearer token to passport, even on a route that allows keys', async () => {
    metadata[ALLOW_API_KEY] = true;
    const { ctx } = context({ authorization: 'Bearer eyJhbGciOi.payload.sig' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(apiKeys.authenticate).not.toHaveBeenCalled();
    expect(passportCanActivate).toHaveBeenCalledTimes(1);
  });

  it('sends a request with no credentials to passport, which 401s it', async () => {
    passportCanActivate.mockRejectedValueOnce(new UnauthorizedException());
    const { ctx } = context({});

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('skips RabbitMQ contexts', async () => {
    const ctx = { getType: () => 'rmq' } as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
