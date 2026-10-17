import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '.prisma/tenant-client';

import {
  IDEMPOTENCY_TTL_MS,
  IdempotencyService,
  hashRequest,
  stableStringify,
} from './idempotency.service';
import { PrismaService } from '../prisma.service';

type MockPrisma = {
  idempotencyKey: {
    create: jest.Mock<Promise<unknown>, [Prisma.IdempotencyKeyCreateArgs]>;
    findUnique: jest.Mock;
    update: jest.Mock<Promise<unknown>, [Prisma.IdempotencyKeyUpdateArgs]>;
    deleteMany: jest.Mock<
      Promise<{ count: number }>,
      [Prisma.IdempotencyKeyDeleteManyArgs]
    >;
  };
};

const duplicate = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['organisationId', 'key'] },
  });

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let prisma: MockPrisma;

  const body = { name: 'Acme', subdomain: 'acme', planId: 'starter' };
  const future = new Date(Date.now() + IDEMPOTENCY_TTL_MS / 2);

  beforeEach(async () => {
    prisma = {
      idempotencyKey: {
        create: jest.fn<Promise<unknown>, [Prisma.IdempotencyKeyCreateArgs]>(),
        findUnique: jest.fn(),
        update: jest.fn<Promise<unknown>, [Prisma.IdempotencyKeyUpdateArgs]>(),
        deleteMany: jest.fn<
          Promise<{ count: number }>,
          [Prisma.IdempotencyKeyDeleteManyArgs]
        >(),
      },
    };
    prisma.idempotencyKey.create.mockResolvedValue({});
    prisma.idempotencyKey.update.mockResolvedValue({});
    prisma.idempotencyKey.deleteMany.mockResolvedValue({ count: 1 });

    const moduleRef = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(IdempotencyService);
  });

  describe('hashing', () => {
    it('ignores key order and undefined fields', () => {
      expect(stableStringify({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(
        '{"a":[{"c":3,"d":2}],"b":1}',
      );
      expect(hashRequest({ a: 1, b: 2 })).toBe(hashRequest({ b: 2, a: 1 }));
      expect(hashRequest({ a: 1, b: undefined })).toBe(hashRequest({ a: 1 }));
      expect(hashRequest({ a: 1 })).not.toBe(hashRequest({ a: 2 }));
    });
  });

  describe('run', () => {
    it('reserves the key for 24 h, runs the request once and stores its response', async () => {
      const created = { id: 'tenant-1', createdAt: new Date('2026-10-17') };
      const execute = jest.fn().mockResolvedValue(created);

      const result = await service.run('org-1', 'key-1', body, execute);

      expect(result).toEqual({ body: created, replayed: false });
      expect(execute).toHaveBeenCalledTimes(1);
      const [[{ data }]] = prisma.idempotencyKey.create.mock.calls;
      expect(data).toMatchObject({
        organisationId: 'org-1',
        key: 'key-1',
        requestHash: hashRequest(body),
      });
      const expiresAt = data.expiresAt as Date;
      expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(
        IDEMPOTENCY_TTL_MS - 5_000,
      );
      expect(prisma.idempotencyKey.update).toHaveBeenCalledWith({
        where: {
          organisationId_key: { organisationId: 'org-1', key: 'key-1' },
        },
        data: {
          response: { id: 'tenant-1', createdAt: '2026-10-17T00:00:00.000Z' },
        },
      });
    });

    it('replays the stored response for the same key and body without running again', async () => {
      prisma.idempotencyKey.create.mockRejectedValueOnce(duplicate());
      prisma.idempotencyKey.findUnique.mockResolvedValueOnce({
        id: 'row-1',
        requestHash: hashRequest(body),
        response: { id: 'tenant-1' },
        expiresAt: future,
      });
      const execute = jest.fn();

      const result = await service.run(
        'org-1',
        'key-1',
        { planId: 'starter', subdomain: 'acme', name: 'Acme' },
        execute,
      );

      expect(result).toEqual({ body: { id: 'tenant-1' }, replayed: true });
      expect(execute).not.toHaveBeenCalled();
      expect(prisma.idempotencyKey.update).not.toHaveBeenCalled();
    });

    it('refuses the same key with a different body with 422', async () => {
      prisma.idempotencyKey.create.mockRejectedValueOnce(duplicate());
      prisma.idempotencyKey.findUnique.mockResolvedValueOnce({
        id: 'row-1',
        requestHash: hashRequest({ ...body, subdomain: 'other' }),
        response: { id: 'tenant-1' },
        expiresAt: future,
      });
      const execute = jest.fn();

      await expect(
        service.run('org-1', 'key-1', body, execute),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(execute).not.toHaveBeenCalled();
    });

    it('answers 409 while the first request with the key is still running', async () => {
      prisma.idempotencyKey.create.mockRejectedValueOnce(duplicate());
      prisma.idempotencyKey.findUnique.mockResolvedValueOnce({
        id: 'row-1',
        requestHash: hashRequest(body),
        response: null,
        expiresAt: future,
      });

      await expect(
        service.run('org-1', 'key-1', body, jest.fn()),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('treats an expired key as new', async () => {
      prisma.idempotencyKey.create
        .mockRejectedValueOnce(duplicate())
        .mockResolvedValueOnce({});
      const expiresAt = new Date(Date.now() - 1_000);
      prisma.idempotencyKey.findUnique.mockResolvedValueOnce({
        id: 'row-1',
        requestHash: hashRequest({ other: true }),
        response: { id: 'old' },
        expiresAt,
      });
      const execute = jest.fn().mockResolvedValue({ id: 'tenant-2' });

      const result = await service.run('org-1', 'key-1', body, execute);

      expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({
        where: { id: 'row-1', expiresAt },
      });
      expect(prisma.idempotencyKey.create).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ body: { id: 'tenant-2' }, replayed: false });
    });

    it('releases the key when the request fails, so the client can retry it', async () => {
      const execute = jest.fn().mockRejectedValue(new Error('broker down'));

      await expect(
        service.run('org-1', 'key-1', body, execute),
      ).rejects.toThrow('broker down');

      expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({
        where: {
          organisationId: 'org-1',
          key: 'key-1',
          response: { equals: Prisma.DbNull },
        },
      });
      expect(prisma.idempotencyKey.update).not.toHaveBeenCalled();
    });

    it('rejects a key longer than 255 characters before touching the database', async () => {
      await expect(
        service.run('org-1', 'k'.repeat(256), body, jest.fn()),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.idempotencyKey.create).not.toHaveBeenCalled();
    });

    it('still returns the response when storing it fails', async () => {
      prisma.idempotencyKey.update.mockRejectedValueOnce(new Error('db gone'));
      const execute = jest.fn().mockResolvedValue({ id: 'tenant-1' });

      await expect(
        service.run('org-1', 'key-1', body, execute),
      ).resolves.toEqual({ body: { id: 'tenant-1' }, replayed: false });
    });
  });

  describe('purgeExpired', () => {
    it('deletes keys past their expiry', async () => {
      prisma.idempotencyKey.deleteMany.mockResolvedValueOnce({ count: 3 });

      await expect(service.purgeExpired()).resolves.toBe(3);

      const [[{ where }]] = prisma.idempotencyKey.deleteMany.mock.calls;
      expect((where?.expiresAt as { lt: Date }).lt).toBeInstanceOf(Date);
    });

    it('swallows a database error', async () => {
      prisma.idempotencyKey.deleteMany.mockRejectedValueOnce(new Error('x'));
      await expect(service.purgeExpired()).resolves.toBe(0);
    });
  });
});
