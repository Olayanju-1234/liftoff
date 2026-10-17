import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { STATUS_TOKEN_PATTERN } from '@liftoff/shared-types';
import {
  deriveStatusToken,
  hashStatusToken,
  statusUrlFor,
} from './status-token';
import { StatusTokenService } from './status-token.service';
import { newTenantId } from '../tenants/ids';

const configWith = (values: Record<string, string | undefined>) =>
  ({
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      if (values[key] === undefined) throw new Error(`${key} unset`);
      return values[key];
    },
  }) as unknown as ConfigService;

describe('status tokens', () => {
  const secret = 's'.repeat(40);

  it('derives the same 43-character base64url token for an id every time, different per id and per secret', () => {
    const a = deriveStatusToken(secret, 'cmv9gs7040002vyzf6leznb2s');
    expect(a).toMatch(STATUS_TOKEN_PATTERN);
    expect(deriveStatusToken(secret, 'cmv9gs7040002vyzf6leznb2s')).toBe(a);
    expect(deriveStatusToken(secret, 'cmv9gs7040002vyzf6leznb2t')).not.toBe(a);
    expect(
      deriveStatusToken('t'.repeat(40), 'cmv9gs7040002vyzf6leznb2s'),
    ).not.toBe(a);
  });

  it('hashes the token with SHA-256 so only the hash is stored', () => {
    const token = deriveStatusToken(secret, 'id');
    expect(hashStatusToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashStatusToken(token)).not.toContain(token);
  });

  it('builds the URL under the frontend without a double slash', () => {
    expect(statusUrlFor('https://liftoff.example/', 'tok')).toBe(
      'https://liftoff.example/status/tok',
    );
  });

  it('draws tenant ids in the shape the gateway accepts', () => {
    const ids = new Set(Array.from({ length: 50 }, newTenantId));
    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(id).toMatch(/^c[a-z0-9]{24}$/);
    }
  });

  describe('StatusTokenService', () => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
      warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('uses STATUS_TOKEN_SECRET and FRONTEND_URL', () => {
      const service = new StatusTokenService(
        configWith({
          STATUS_TOKEN_SECRET: secret,
          JWT_SECRET: 'j'.repeat(40),
          FRONTEND_URL: 'https://liftoff.example/',
        }),
      );
      const token = deriveStatusToken(secret, 'id');
      expect(service.tokenFor('id')).toBe(token);
      expect(service.hashFor('id')).toBe(hashStatusToken(token));
      expect(service.urlFor('id')).toBe(
        `https://liftoff.example/status/${token}`,
      );
    });

    it('falls back to JWT_SECRET, with a warning, and to the local frontend URL', () => {
      const service = new StatusTokenService(
        configWith({ JWT_SECRET: 'j'.repeat(40) }),
      );
      expect(service.tokenFor('id')).toBe(
        deriveStatusToken('j'.repeat(40), 'id'),
      );
      expect(service.urlFor('id')).toMatch(
        /^http:\/\/localhost:5173\/status\//,
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('STATUS_TOKEN_SECRET is not set'),
      );
    });

    it('refuses to start with no secret at all', () => {
      expect(() => new StatusTokenService(configWith({}))).toThrow(
        'JWT_SECRET unset',
      );
    });
  });
});
