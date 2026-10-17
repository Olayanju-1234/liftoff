import {
  AmqpConnection,
  Nack,
  RABBIT_HANDLER,
} from '@golevelup/nestjs-rabbitmq';
import { PLAN_IDS } from '@liftoff/shared-types';
import type {
  InternalBillingConfig,
  TenantBillingActivePayload,
  TenantCredentialsReadyPayload,
} from '@liftoff/shared-types';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Stripe from 'stripe';

import { AppService } from './app.service';
import { InternalApiClient } from './internal-api.client';

const mockStripe = {
  customers: {
    create: jest.fn<Promise<{ id: string }>, [Stripe.CustomerCreateParams]>(),
  },
  subscriptions: {
    create: jest.fn<
      Promise<Pick<Stripe.Subscription, 'id' | 'status' | 'trial_end'>>,
      [Stripe.SubscriptionCreateParams]
    >(),
  },
};

// Resolved lazily: app.service requires 'stripe' before mockStripe is initialised.
jest.mock('stripe', () => jest.fn(() => mockStripe));
const mockStripeConstructor = jest.requireMock<jest.Mock>('stripe');

describe('AppService', () => {
  let service: AppService;
  let amqp: { publish: jest.Mock };
  let internalApi: { billingConfig: jest.Mock };

  const payload: TenantCredentialsReadyPayload = {
    tenantId: 'tenant-1',
    subdomain: 'acme',
    planId: 'pro',
  };

  const connected: InternalBillingConfig = {
    tenantId: 'tenant-1',
    organisationId: 'org-1',
    test: false,
    configured: true,
    stripeSecretKey: 'sk_test_orgkey12345',
    prices: {
      starter: 'price_starter',
      pro: 'price_pro',
      enterprise: 'price_enterprise',
    },
  };

  // 2026-10-29T00:00:00.000Z
  const trialEnd = 1793232000;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    mockStripeConstructor.mockClear();
    amqp = { publish: jest.fn().mockResolvedValue(true) };
    internalApi = { billingConfig: jest.fn().mockResolvedValue(connected) };
    mockStripe.customers.create
      .mockReset()
      .mockResolvedValue({ id: 'cus_123' });
    mockStripe.subscriptions.create.mockReset().mockResolvedValue({
      id: 'sub_123',
      status: 'trialing',
      trial_end: trialEnd,
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        AppService,
        { provide: AmqpConnection, useValue: amqp },
        { provide: InternalApiClient, useValue: internalApi },
      ],
    }).compile();
    service = moduleRef.get(AppService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('subscribes to tenant.credentials.ready with a dead-letter exchange', () => {
    // SetMetadata stores method metadata on the function itself.
    const handler: unknown = Object.getOwnPropertyDescriptor(
      AppService.prototype,
      'handleTenantCredentialsReady',
    )?.value;
    const config: unknown = Reflect.getMetadata(
      RABBIT_HANDLER,
      handler as object,
    );

    expect(config).toMatchObject({
      type: 'subscribe',
      exchange: 'provisioning.direct',
      routingKey: 'tenant.credentials.ready',
      queue: 'billing-queue',
      queueOptions: { deadLetterExchange: 'dlx.provisioning' },
    });
  });

  it("subscribes the tenant in the company's own Stripe account with a 14-day trial", async () => {
    await expect(
      service.handleTenantCredentialsReady(payload),
    ).resolves.toBeUndefined();

    expect(internalApi.billingConfig).toHaveBeenCalledWith('tenant-1');
    expect(mockStripeConstructor).toHaveBeenCalledWith(
      'sk_test_orgkey12345',
      expect.anything(),
    );
    expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_123',
        items: [{ price: 'price_pro' }],
        trial_period_days: 14,
        metadata: expect.objectContaining({
          tenantId: 'tenant-1',
          liftoffOrganisationId: 'org-1',
        }) as unknown,
      }),
    );
    const billingActive: TenantBillingActivePayload = {
      tenantId: 'tenant-1',
      subdomain: 'acme',
      planId: 'pro',
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
      subscriptionStatus: 'trialing',
      trialEnd: '2026-10-29T00:00:00.000Z',
    };
    expect(amqp.publish).toHaveBeenCalledTimes(1);
    expect(amqp.publish).toHaveBeenCalledWith(
      'provisioning.direct',
      'tenant.billing.active',
      billingActive,
    );
  });

  it.each(PLAN_IDS)(
    'uses the price the company mapped to plan %s, case-insensitively',
    async (planId) => {
      await service.handleTenantCredentialsReady({
        ...payload,
        planId: planId.toUpperCase(),
      });

      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({ items: [{ price: `price_${planId}` }] }),
      );
    },
  );

  it('skips billing as not-connected when the company has no Stripe key, without calling Stripe', async () => {
    internalApi.billingConfig.mockResolvedValueOnce({
      ...connected,
      configured: false,
      stripeSecretKey: null,
    });

    await expect(
      service.handleTenantCredentialsReady(payload),
    ).resolves.toBeUndefined();

    expect(mockStripeConstructor).not.toHaveBeenCalled();
    const skipped: TenantBillingActivePayload = {
      tenantId: 'tenant-1',
      subdomain: 'acme',
      planId: 'pro',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: 'skipped',
      trialEnd: null,
      skipped: true,
      skipReason: 'not-connected',
    };
    expect(amqp.publish).toHaveBeenCalledWith(
      'provisioning.direct',
      'tenant.billing.active',
      skipped,
    );
  });

  it('never simulates a subscription: no sim_ ids anywhere', async () => {
    internalApi.billingConfig.mockResolvedValueOnce({
      ...connected,
      configured: false,
      stripeSecretKey: null,
    });

    await service.handleTenantCredentialsReady(payload);

    expect(JSON.stringify(amqp.publish.mock.calls)).not.toContain('sim_');
  });

  it('skips a test tenant without asking tenant-service or Stripe', async () => {
    await expect(
      service.handleTenantCredentialsReady({ ...payload, test: true }),
    ).resolves.toBeUndefined();

    expect(internalApi.billingConfig).not.toHaveBeenCalled();
    expect(mockStripe.customers.create).not.toHaveBeenCalled();
    expect(amqp.publish).toHaveBeenCalledWith(
      'provisioning.direct',
      'tenant.billing.active',
      expect.objectContaining({
        skipped: true,
        skipReason: 'test',
        test: true,
        stripeSubscriptionId: null,
      }),
    );
  });

  it('nacks without requeue when the skipped billing cannot be published', async () => {
    amqp.publish.mockRejectedValueOnce(new Error('channel closed'));

    const result = await service.handleTenantCredentialsReady({
      ...payload,
      test: true,
    });

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
  });

  it('publishes a null trialEnd when the subscription has no trial', async () => {
    mockStripe.subscriptions.create.mockResolvedValueOnce({
      id: 'sub_123',
      status: 'active',
      trial_end: null,
    });

    await service.handleTenantCredentialsReady(payload);

    expect(amqp.publish).toHaveBeenCalledWith(
      'provisioning.direct',
      'tenant.billing.active',
      expect.objectContaining({ subscriptionStatus: 'active', trialEnd: null }),
    );
  });

  it('nacks without requeue and creates nothing when the plan has no price', async () => {
    internalApi.billingConfig.mockResolvedValueOnce({
      ...connected,
      prices: { ...connected.prices, pro: null },
    });

    const result = await service.handleTenantCredentialsReady(payload);

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
    expect(mockStripe.customers.create).not.toHaveBeenCalled();
    expect(amqp.publish).not.toHaveBeenCalled();
  });

  it('nacks without requeue for an unknown plan', async () => {
    const result = await service.handleTenantCredentialsReady({
      ...payload,
      planId: 'platinum',
    });

    expect(result).toBeInstanceOf(Nack);
    expect(mockStripe.subscriptions.create).not.toHaveBeenCalled();
    expect(amqp.publish).not.toHaveBeenCalled();
  });

  it('nacks without requeue when tenant-service cannot be reached, so the step is FAILED and retryable', async () => {
    internalApi.billingConfig.mockRejectedValueOnce(
      new Error('tenant-service answered 503'),
    );

    const result = await service.handleTenantCredentialsReady(payload);

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
    expect(mockStripeConstructor).not.toHaveBeenCalled();
    expect(amqp.publish).not.toHaveBeenCalled();
  });

  it('nacks without requeue and publishes nothing when Stripe fails', async () => {
    mockStripe.subscriptions.create.mockRejectedValueOnce(
      new Error('card_declined'),
    );

    const result = await service.handleTenantCredentialsReady(payload);

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
    expect(amqp.publish).not.toHaveBeenCalled();
  });

  it('nacks without requeue when publishing fails, so the message dead-letters', async () => {
    amqp.publish.mockRejectedValueOnce(new Error('channel closed'));

    const result = await service.handleTenantCredentialsReady(payload);

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
  });
});
