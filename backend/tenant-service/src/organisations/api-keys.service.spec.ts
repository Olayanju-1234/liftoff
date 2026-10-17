import {
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'crypto';
import type { Prisma } from '.prisma/tenant-client';

import { ApiKeysService } from './api-keys.service';
import { PrismaService } from '../prisma.service';
import { API_KEY_PREFIX_LENGTH, generateApiKey, hashApiKey } from './api-key';

type MockPrisma = {
  apiKey: {
    create: jest.Mock<Promise<unknown>, [Prisma.ApiKeyCreateArgs]>;
    findMany: jest.Mock;
    deleteMany: jest.Mock<
      Promise<{ count: number }>,
      [Prisma.ApiKeyDeleteManyArgs]
    >;
    findUnique: jest.Mock<Promise<unknown>, [Prisma.ApiKeyFindUniqueArgs]>;
    update: jest.Mock;
  };
};

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = {
      apiKey: {
        create: jest.fn<Promise<unknown>, [Prisma.ApiKeyCreateArgs]>(),
        findMany: jest.fn(),
        deleteMany: jest.fn<
          Promise<{ count: number }>,
          [Prisma.ApiKeyDeleteManyArgs]
        >(),
        findUnique: jest.fn<Promise<unknown>, [Prisma.ApiKeyFindUniqueArgs]>(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [ApiKeysService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ApiKeysService);
  });

  describe('key format', () => {
    it('is prefixed, random and stored only as a SHA-256 hash', () => {
      const a = generateApiKey();
      const b = generateApiKey();

      expect(a.key).toMatch(/^lk_[A-Za-z0-9_-]{43}$/);
      expect(a.key).not.toBe(b.key);
      expect(a.prefix).toBe(a.key.slice(0, API_KEY_PREFIX_LENGTH));
      expect(a.keyHash).toBe(createHash('sha256').update(a.key).digest('hex'));
      expect(a.keyHash).not.toContain(a.key.slice(API_KEY_PREFIX_LENGTH));
    });
  });

  describe('create', () => {
    it('stores the hash and prefix, and returns the key only in this response', async () => {
      prisma.apiKey.create.mockImplementationOnce(({ data }) =>
        Promise.resolve({
          id: 'key-1',
          name: data.name,
          prefix: data.prefix,
          lastUsedAt: null,
          createdAt: new Date('2026-10-17T00:00:00Z'),
        }),
      );

      const created = await service.create('org-1', 'Billing');

      const [[{ data }]] = prisma.apiKey.create.mock.calls;
      expect(data).toEqual({
        organisationId: 'org-1',
        name: 'Billing',
        prefix: created.key.slice(0, API_KEY_PREFIX_LENGTH),
        keyHash: hashApiKey(created.key),
      });
      expect(data).not.toHaveProperty('key');
      expect(created).toMatchObject({ id: 'key-1', name: 'Billing' });
    });
  });

  describe('list', () => {
    it("selects only the organisation's keys and never the hash", async () => {
      prisma.apiKey.findMany.mockResolvedValueOnce([]);

      await service.list('org-1');

      const [[args]] = prisma.apiKey.findMany.mock.calls as [
        [Prisma.ApiKeyFindManyArgs],
      ];
      expect(args.where).toEqual({ organisationId: 'org-1' });
      expect(args.select).toEqual({
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        createdAt: true,
      });
    });
  });

  describe('revoke', () => {
    it('deletes within the organisation', async () => {
      prisma.apiKey.deleteMany.mockResolvedValueOnce({ count: 1 });

      await service.revoke('org-1', 'key-1');

      expect(prisma.apiKey.deleteMany).toHaveBeenCalledWith({
        where: { id: 'key-1', organisationId: 'org-1' },
      });
    });

    it("answers 404 for another organisation's key", async () => {
      prisma.apiKey.deleteMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.revoke('org-2', 'key-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('authenticate', () => {
    it('resolves a key to its organisation by hash and records the use', async () => {
      const { key, keyHash } = generateApiKey();
      prisma.apiKey.findUnique.mockResolvedValueOnce({
        id: 'key-1',
        organisationId: 'org-1',
      });

      await expect(service.authenticate(key)).resolves.toEqual({
        kind: 'api-key',
        apiKeyId: 'key-1',
        organisationId: 'org-1',
      });

      const [[{ where }]] = prisma.apiKey.findUnique.mock.calls;
      expect(where).toEqual({ keyHash });
      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-1' },
        data: { lastUsedAt: expect.any(Date) as Date },
      });
    });

    it('rejects an unknown or revoked key with 401', async () => {
      prisma.apiKey.findUnique.mockResolvedValueOnce(null);

      await expect(service.authenticate('lk_nope')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.apiKey.update).not.toHaveBeenCalled();
    });

    it('still authenticates when recording the use fails', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      prisma.apiKey.findUnique.mockResolvedValueOnce({
        id: 'key-1',
        organisationId: 'org-1',
      });
      prisma.apiKey.update.mockRejectedValueOnce(new Error('db down'));

      await expect(service.authenticate('lk_x')).resolves.toMatchObject({
        organisationId: 'org-1',
      });
      await new Promise((resolve) => process.nextTick(resolve));
      expect(warn).toHaveBeenCalledWith(
        'Could not record use of API key key-1: db down',
      );
      warn.mockRestore();
    });
  });
});
