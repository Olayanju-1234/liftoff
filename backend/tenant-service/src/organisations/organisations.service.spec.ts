import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '.prisma/tenant-client';

import { OrganisationsService } from './organisations.service';
import { DEFAULT_CUSTOMER_PLANS } from '@liftoff/shared-types';
import { OrgSecretsService } from './org-secrets.service';
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
  baseDomain: null as string | null,
  stripeSecretKeyEncrypted: null as string | null,
  stripePrices: null as Prisma.JsonValue | null,
  plans: null as Prisma.JsonValue | null,
  maxActiveTenants: 10,
  maxProvisionsPerDay: 50,
  onboardingDismissedAt: null as Date | null,
  createdAt: new Date('2026-10-17T00:00:00Z'),
  updatedAt: new Date('2026-10-17T00:00:00Z'),
};

const noPrices = { starter: null, pro: null, enterprise: null };

describe('OrganisationsService', () => {
  let service: OrganisationsService;
  let prisma: MockPrisma;
  let secrets: { enabled: boolean; encrypt: jest.Mock; decrypt: jest.Mock };

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
    secrets = {
      enabled: true,
      encrypt: jest.fn((plain: string) => `enc(${plain})`),
      decrypt: jest.fn((blob: string) => blob.slice(4, -1)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrganisationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrgSecretsService, useValue: secrets },
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
        baseDomain: null,
        stripeConfigured: false,
        plans: DEFAULT_CUSTOMER_PLANS,
        stripePrices: noPrices,
        limits: { maxActiveTenants: 10, maxProvisionsPerDay: 50 },
        onboardingDismissedAt: null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
      expect(result).not.toHaveProperty('webhookSecret');
    });

    it('never returns the Stripe key, only stripeConfigured and the prices', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce({
        ...row,
        stripeSecretKeyEncrypted: 'enc(sk_test_x)',
        stripePrices: { starter: 'price_a', bogus: 1 },
      });

      const result = await service.get('org-1');

      expect(result.stripeConfigured).toBe(true);
      expect(result.stripePrices).toEqual({ ...noPrices, starter: 'price_a' });
      expect(JSON.stringify(result)).not.toContain('sk_test');
      expect(result).not.toHaveProperty('stripeSecretKeyEncrypted');
    });

    it('404s when the organisation is gone', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce(null);

      await expect(service.get('org-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('sets and clears the base domain without touching the webhook', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce(row);
      const set = await service.update('org-1', { baseDomain: 'acme.app' });
      expect(set.baseDomain).toBe('acme.app');
      expect(set.webhookSecret).toBeUndefined();
      let [[{ data }]] = prisma.organisation.update.mock.calls;
      expect(data).toEqual({ baseDomain: 'acme.app' });

      prisma.organisation.findUnique.mockResolvedValueOnce({
        ...row,
        baseDomain: 'acme.app',
      });
      const cleared = await service.update('org-1', { baseDomain: null });
      expect(cleared.baseDomain).toBeNull();
      [, [{ data }]] = prisma.organisation.update.mock.calls;
      expect(data).toEqual({ baseDomain: null });
    });

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

  describe('onboarding checklist', () => {
    it('reads as not dismissed until someone dismisses it', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce(row);

      const result = await service.get('org-1');

      expect(result.onboardingDismissedAt).toBeNull();
    });

    it('dismissing sets onboardingDismissedAt once and returns it', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce(row);

      const result = await service.update('org-1', {
        dismissOnboarding: true,
      });

      const [[{ data }]] = prisma.organisation.update.mock.calls;
      expect(data.onboardingDismissedAt).toBeInstanceOf(Date);
      expect(result.onboardingDismissedAt).toBeInstanceOf(Date);
    });

    it('keeps the first dismissal time when dismissed again', async () => {
      const dismissedAt = new Date('2026-10-16T12:00:00Z');
      prisma.organisation.findUnique.mockResolvedValueOnce({
        ...row,
        onboardingDismissedAt: dismissedAt,
      });
      prisma.organisation.update.mockImplementationOnce(({ data }) =>
        Promise.resolve({
          ...row,
          onboardingDismissedAt: dismissedAt,
          ...data,
        }),
      );

      const result = await service.update('org-1', {
        dismissOnboarding: true,
      });

      const [[{ data }]] = prisma.organisation.update.mock.calls;
      expect(data).not.toHaveProperty('onboardingDismissedAt');
      expect(result.onboardingDismissedAt).toEqual(dismissedAt);
    });

    it('ignores dismissOnboarding: false', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce(row);

      await service.update('org-1', { dismissOnboarding: false, name: 'A' });

      const [[{ data }]] = prisma.organisation.update.mock.calls;
      expect(data).toEqual({ name: 'A' });
    });
  });

  describe('assertHandleFree', () => {
    it('409s on a taken handle', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce({ id: 'org-9' });

      await expect(service.assertHandleFree('acme')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('stores the Stripe key encrypted, merges prices, and returns neither key nor ciphertext', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce({
        ...row,
        stripePrices: { starter: 'price_old', pro: 'price_pro' },
      });

      const result = await service.update('org-1', {
        stripeSecretKey: 'sk_test_abcdefghijk',
        stripePrices: { starter: 'price_new', enterprise: null },
      });

      const [[{ data }]] = prisma.organisation.update.mock.calls;
      expect(secrets.encrypt).toHaveBeenCalledWith('sk_test_abcdefghijk');
      expect(data.stripeSecretKeyEncrypted).toBe('enc(sk_test_abcdefghijk)');
      expect(data.stripePrices).toEqual({
        starter: 'price_new',
        pro: 'price_pro',
      });
      expect(result.stripeConfigured).toBe(true);
      expect(result.stripePrices).toEqual({
        starter: 'price_new',
        pro: 'price_pro',
        enterprise: null,
      });
      expect(JSON.stringify(result)).not.toContain('sk_test');
    });

    it('disconnects Stripe with null and leaves the prices for a reconnect', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce({
        ...row,
        stripeSecretKeyEncrypted: 'enc(sk_test_x)',
        stripePrices: { starter: 'price_a' },
      });

      const result = await service.update('org-1', { stripeSecretKey: null });

      const [[{ data }]] = prisma.organisation.update.mock.calls;
      expect(data).toEqual({ stripeSecretKeyEncrypted: null });
      expect(result.stripeConfigured).toBe(false);
      expect(secrets.encrypt).not.toHaveBeenCalled();
    });

    it('clears the price map with null', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce({
        ...row,
        stripePrices: { starter: 'price_a' },
      });

      await service.update('org-1', { stripePrices: null });

      const [[{ data }]] = prisma.organisation.update.mock.calls;
      expect(data).toEqual({ stripePrices: Prisma.DbNull });
    });

    it('writes nothing when the key cannot be encrypted (ORG_SECRETS_KEY unset)', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce(row);
      secrets.encrypt.mockImplementationOnce(() => {
        throw new ServiceUnavailableException('no key');
      });

      await expect(
        service.update('org-1', { stripeSecretKey: 'sk_test_abcdefghijk' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(prisma.organisation.update).not.toHaveBeenCalled();
    });
  });

  describe('stripeCredentials', () => {
    it('decrypts the key for the internal API', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce({
        stripeSecretKeyEncrypted: 'enc(sk_live_abcdefghijk)',
        stripePrices: { pro: 'price_pro' },
      });

      await expect(service.stripeCredentials('org-1')).resolves.toEqual({
        configured: true,
        stripeSecretKey: 'sk_live_abcdefghijk',
        // Every stored price, keyed by plan id: a tenant may be on a plan since removed.
        prices: { pro: 'price_pro' },
      });
    });

    it('reports not configured without touching the secrets service', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce({
        stripeSecretKeyEncrypted: null,
        stripePrices: null,
      });

      await expect(service.stripeCredentials('org-1')).resolves.toEqual({
        configured: false,
        stripeSecretKey: null,
        prices: {},
      });
      expect(secrets.decrypt).not.toHaveBeenCalled();
    });

    it('404s when the organisation is gone', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce(null);
      await expect(service.stripeCredentials('org-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('customer plans', () => {
    const custom = [
      { id: 'growth', name: 'Growth', description: 'For teams of 10 to 50' },
      { id: 'scale', name: 'Scale' },
    ];

    it('shows the defaults with a price slot each when none are defined', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce({
        ...row,
        stripePrices: { pro: 'price_pro', legacy: 'price_legacy' },
      });

      const result = await service.get('org-1');

      expect(result.plans).toEqual(DEFAULT_CUSTOMER_PLANS);
      expect(result.stripePrices).toEqual({
        starter: null,
        pro: 'price_pro',
        enterprise: null,
      });
      expect(result).not.toHaveProperty('storedPrices');
    });

    it('stores the plans the company defines and prices them by id', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce(row);

      const result = await service.update('org-1', {
        plans: custom,
        stripePrices: { growth: 'price_growth' },
      });

      const [[{ data }]] = prisma.organisation.update.mock.calls;
      expect(data.plans).toEqual(custom);
      expect(data.stripePrices).toEqual({ growth: 'price_growth' });
      expect(result.plans).toEqual(custom);
      expect(result.stripePrices).toEqual({
        growth: 'price_growth',
        scale: null,
      });
      expect(result).not.toHaveProperty('storedPrices');
    });

    it('clears one price with null without touching the others, and keeps prices of removed plans for their tenants', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce({
        ...row,
        plans: custom,
        stripePrices: { growth: 'price_growth', scale: 'price_scale' },
      });

      const result = await service.update('org-1', {
        plans: [custom[0]],
        stripePrices: { growth: null },
      });

      const [[{ data }]] = prisma.organisation.update.mock.calls;
      expect(data.stripePrices).toEqual({ scale: 'price_scale' });
      expect(result.plans).toEqual([custom[0]]);
      expect(result.stripePrices).toEqual({ growth: null });
    });

    it('goes back to the defaults with plans: null', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce({
        ...row,
        plans: custom,
      });

      const result = await service.update('org-1', { plans: null });

      const [[{ data }]] = prisma.organisation.update.mock.calls;
      expect(data).toEqual({ plans: Prisma.DbNull });
      expect(result.plans).toEqual(DEFAULT_CUSTOMER_PLANS);
    });

    it('hands billing every stored price, not just the current plans', async () => {
      prisma.organisation.findUnique.mockResolvedValueOnce({
        stripeSecretKeyEncrypted: 'enc(sk_live_abcdefghijk)',
        stripePrices: { growth: 'price_growth', legacy: 'price_legacy' },
      });

      const result = await service.stripeCredentials('org-1');

      expect(result.prices).toEqual({
        growth: 'price_growth',
        legacy: 'price_legacy',
      });
    });
  });
});
