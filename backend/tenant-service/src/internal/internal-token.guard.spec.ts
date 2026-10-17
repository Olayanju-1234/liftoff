import {
  ServiceUnavailableException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalTokenGuard } from './internal-token.guard';

const guardWith = (token?: string) =>
  new InternalTokenGuard({
    get: () => token,
  } as unknown as ConfigService);

const contextWith = (header?: string | string[]): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: header === undefined ? {} : { 'x-internal-token': header },
      }),
    }),
  }) as unknown as ExecutionContext;

describe('InternalTokenGuard', () => {
  const token = 't'.repeat(40);

  it('lets a request through with the shared token', () => {
    expect(guardWith(token).canActivate(contextWith(token))).toBe(true);
    expect(guardWith(token).canActivate(contextWith([token]))).toBe(true);
  });

  it.each([undefined, '', 'u'.repeat(40), 't'.repeat(39)])(
    'answers 401 for token %p',
    (presented) => {
      expect(() =>
        guardWith(token).canActivate(contextWith(presented)),
      ).toThrow(UnauthorizedException);
    },
  );

  it('answers 503 when INTERNAL_API_TOKEN is not set, whatever is presented', () => {
    expect(() => guardWith(undefined).canActivate(contextWith(token))).toThrow(
      ServiceUnavailableException,
    );
    expect(() => guardWith('').canActivate(contextWith(''))).toThrow(
      ServiceUnavailableException,
    );
  });
});
