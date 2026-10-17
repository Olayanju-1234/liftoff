import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Prisma } from '.prisma/tenant-client';

import { OrganisationsService } from './organisations.service';
import { PrismaService } from '../prisma.service';

type MockPrisma = {
  organisation: {
    findUnique: jest.Mock<
      Promise<unknown>,
      [Prisma.OrganisationFindUniqueArgs]
    >;
    update: jest.Mock<Promise<unknown>, [Prisma.OrganisationUpdateArgs]>;
  };
};

const row = {
  id: 'org-1',
  name: 'Acme',
  handle: 'acme',
  webhookUrl: null as string | null,
  webhookSecret: null as string | null,
  createdAt: new Date('2026-10-17T00:00:00Z'),
  updatedAt: new Date('2026-10-17T00:00:00Z'),
};

describe('OrganisationsService', () => {
  let service: OrganisationsService;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = {
      organisation: {
        findUnique: jest.fn<
          Promise<unknown>,
          [Prisma.OrganisationFindUniqueArgs]
        >(),
        update: jest.fn<Promise<unknown>, [Prisma.OrganisationUpdateArgs]>(
          ({ data }) => Promise.resolve({ ...row, ...data }),
        ),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrganisationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(OrganisationsService);
  });

  describe('get', () => {
    it('never returns the webhook secret, only whether one exists', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce({
        ...row,
        webhookUrl: 'https://hooks.acme.com/liftoff',
        webhookSecret: 'whsec_abc',
      });

      const result = await service.get('org-1');

      expect(result).toEqual({
        id: 'org-1',
        name: 'Acme',
        handle: 'acme',
        webhookUrl: 'https://hooks.acme.com/liftoff',
        webhookConfigured: true,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
      expect(result).not.toHaveProperty('webhookSecret');
    });

    it('404s when the organisation is gone', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce(null);

      await expect(service.get('org-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('setting a webhook URL issues a secret and returns it once', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce(row);

      const result = await service.update('org-1', {
        webhookUrl: 'https://hooks.acme.com/liftoff',
      });

      const [[{ data }]] = prisma.organisation.update.mock.calls;
      expect(data.webhookUrl).toBe('https://hooks.acme.com/liftoff');
      expect(data.webhookSecret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
      expect(result.webhookSecret).toBe(data.webhookSecret);
      expect(result.webhookConfigured).toBe(true);
    });

    it('keeps the secret when the URL is unchanged, and issues a new one when it changes', async () => {
      const configured = {
        ...row,
        webhookUrl: 'https://hooks.acme.com/liftoff',
        webhookSecret: 'whsec_old',
      };
      prisma.organisation.findUnique.mockResolvedValueOnce(configured);
      const same = await service.update('org-1', {
        webhookUrl: 'https://hooks.acme.com/liftoff',
        name: 'Acme Inc',
      });
      expect(same.webhookSecret).toBeUndefined();
      const [[{ data: unchanged }]] = prisma.organisation.update.mock.calls;
      expect(unchanged).toEqual({
        name: 'Acme Inc',
        webhookUrl: 'https://hooks.acme.com/liftoff',
      });

      prisma.organisation.findUnique.mockResolvedValueOnce(configured);
      const moved = await service.update('org-1', {
        webhookUrl: 'https://hooks.acme.com/v2/liftoff',
      });
      expect(moved.webhookSecret).toMatch(/^whsec_/);
      expect(moved.webhookSecret).not.toBe('whsec_old');
    });

    it('rotates the secret on request without changing the URL', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce({
        ...row,
        webhookUrl: 'https://hooks.acme.com/liftoff',
        webhookSecret: 'whsec_old',
      });

      const result = await service.update('org-1', {
        rotateWebhookSecret: true,
      });

      expect(result.webhookSecret).toMatch(/^whsec_/);
      expect(result.webhookSecret).not.toBe('whsec_old');
      const [[{ data }]] = prisma.organisation.update.mock.calls;
      expect(data).toEqual({ webhookSecret: result.webhookSecret });
    });

    it('ignores a rotate request when no URL is set', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce(row);

      const result = await service.update('org-1', {
        rotateWebhookSecret: true,
      });

      expect(result.webhookSecret).toBeUndefined();
      const [[{ data }]] = prisma.organisation.update.mock.calls;
      expect(data).toEqual({});
    });

    it('clearing the URL also drops the secret', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce({
        ...row,
        webhookUrl: 'https://hooks.acme.com/liftoff',
        webhookSecret: 'whsec_old',
      });

      const result = await service.update('org-1', { webhookUrl: null });

      const [[{ data }]] = prisma.organisation.update.mock.calls;
      expect(data).toEqual({ webhookUrl: null, webhookSecret: null });
      expect(result.webhookConfigured).toBe(false);
      expect(result.webhookSecret).toBeUndefined();
    });

    it.each([
      'http://localhost:3000/hook',
      'http://127.0.0.1/hook',
      'https://10.0.0.5/hook',
      'https://169.254.169.254/latest/meta-data',
      'https://[::1]/hook',
      'https://metadata.google.internal/',
      'ftp://hooks.acme.com/x',
      'https://user:pass@hooks.acme.com/x',
    ])('refuses %s as a webhook URL', async (webhookUrl) => {
      prisma.organisation.findUnique.mockResolvedValueOnce(row);

      await expect(
        service.update('org-1', { webhookUrl }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.organisation.update).not.toHaveBeenCalled();
    });
  });

  describe('assertHandleFree', () => {
    it('409s on a taken handle', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce({ id: 'org-9' });

      await expect(service.assertHandleFree('acme')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
