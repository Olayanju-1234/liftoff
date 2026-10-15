import {
  AmqpConnection,
  Nack,
  RABBIT_HANDLER,
} from '@golevelup/nestjs-rabbitmq';
import { PLAN_IDS } from '@liftoff/shared-types';
import type {
  TenantBillingActivePayload,
  TenantCredentialsReadyPayload,
} from '@liftoff/shared-types';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Stripe from 'stripe';

import { AppService } from './app.service';

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
  const env = process.env;
  let amqp: { publish: jest.Mock };

  const payload: TenantCredentialsReadyPayload = {
    tenantId: 'tenant-1',
    subdomain: 'acme',
    planId: 'pro',
  };

  // 2026-10-29T00:00:00.000Z
  const trialEnd = 1793232000;

  const createService = async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AppService, { provide: AmqpConnection, useValue: amqp }],
    }).compile();
    return moduleRef.get(AppService);
  };

  beforeEach(() => {
    process.env = {
      ...env,
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_PRICE_STARTER: 'price_starter',
      STRIPE_PRICE_PRO: 'price_pro',
      STRIPE_PRICE_ENTERPRISE: 'price_enterprise',
    };
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    mockStripeConstructor.mockClear();
    amqp = { publish: jest.fn().mockResolvedValue(true) };
    mockStripe.customers.create
      .mockReset()
      .mockResolvedValue({ id: 'cus_123' });
    mockStripe.subscriptions.create.mockReset().mockResolvedValue({
      id: 'sub_123',
      status: 'trialing',
      trial_end: trialEnd,
    });
  });

  afterEach(() => {
    process.env = env;
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

  it('refuses to start without a Stripe price for every plan', async () => {
    delete process.env.STRIPE_PRICE_PRO;
    delete process.env.STRIPE_PRICE_ENTERPRISE;

    await expect(createService()).rejects.toThrow(
      'Missing Stripe Price ID env vars: STRIPE_PRICE_PRO, STRIPE_PRICE_ENTERPRISE',
    );
  });

  it("starts a 14-day trial on the plan's price, then publishes tenant.billing.active", async () => {
    const service = await createService();

    await expect(
      service.handleTenantCredentialsReady(payload),
    ).resolves.toBeUndefined();

    expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_123',
        items: [{ price: 'price_pro' }],
        trial_period_days: 14,
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
    'subscribes the shared plan id %s to its Stripe price',
    async (planId) => {
      const service = await createService();

      await service.handleTenantCredentialsReady({ ...payload, planId });

      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({ items: [{ price: `price_${planId}` }] }),
      );
    },
  );

  it('matches the plan id case-insensitively', async () => {
    const service = await createService();

    await service.handleTenantCredentialsReady({ ...payload, planId: 'PRO' });

    expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({ items: [{ price: 'price_pro' }] }),
    );
  });

  it('publishes a null trialEnd when the subscription has no trial', async () => {
    mockStripe.subscriptions.create.mockResolvedValueOnce({
      id: 'sub_123',
      status: 'active',
      trial_end: null,
    });
    const service = await createService();

    await service.handleTenantCredentialsReady(payload);

    expect(amqp.publish).toHaveBeenCalledWith(
      'provisioning.direct',
      'tenant.billing.active',
      expect.objectContaining({ subscriptionStatus: 'active', trialEnd: null }),
    );
  });

  it('nacks without requeue and creates no subscription for an unknown plan', async () => {
    const service = await createService();

    const result = await service.handleTenantCredentialsReady({
      ...payload,
      planId: 'platinum',
    });

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
    expect(mockStripe.subscriptions.create).not.toHaveBeenCalled();
    expect(amqp.publish).not.toHaveBeenCalled();
  });

  it('nacks without requeue and publishes nothing when Stripe fails', async () => {
    mockStripe.subscriptions.create.mockRejectedValueOnce(
      new Error('card_declined'),
    );
    const service = await createService();

    const result = await service.handleTenantCredentialsReady(payload);

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
    expect(amqp.publish).not.toHaveBeenCalled();
  });

  it('nacks without requeue when publishing fails, so the message dead-letters', async () => {
    amqp.publish.mockRejectedValueOnce(new Error('channel closed'));
    const service = await createService();

    const result = await service.handleTenantCredentialsReady(payload);

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
  });
  describe('without a Stripe key', () => {
    beforeEach(() => {
      delete process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_PRICE_STARTER;
      delete process.env.STRIPE_PRICE_PRO;
      delete process.env.STRIPE_PRICE_ENTERPRISE;
      jest.useFakeTimers({ now: new Date('2026-10-15T00:00:00.000Z') });
    });

    afterEach(() => jest.useRealTimers());

    it('starts, and publishes a simulated 14-day trial without calling Stripe', async () => {
      const service = await createService();

      await expect(
        service.handleTenantCredentialsReady(payload),
      ).resolves.toBeUndefined();

      expect(mockStripeConstructor).not.toHaveBeenCalled();
      expect(mockStripe.customers.create).not.toHaveBeenCalled();
      const billingActive: TenantBillingActivePayload = {
        tenantId: 'tenant-1',
        subdomain: 'acme',
        planId: 'pro',
        stripeCustomerId: 'sim_cus_tenant-1',
        stripeSubscriptionId: 'sim_sub_tenant-1',
        subscriptionStatus: 'trialing',
        trialEnd: '2026-10-29T00:00:00.000Z',
      };
      expect(amqp.publish).toHaveBeenCalledWith(
        'provisioning.direct',
        'tenant.billing.active',
        billingActive,
      );
    });

    it.each(PLAN_IDS)(
      'simulates a subscription for the shared plan id %s',
      async (planId) => {
        const service = await createService();

        await service.handleTenantCredentialsReady({ ...payload, planId });

        expect(amqp.publish).toHaveBeenCalledWith(
          'provisioning.direct',
          'tenant.billing.active',
          expect.objectContaining({ planId }),
        );
      },
    );

    it('nacks without requeue for an unknown plan', async () => {
      const service = await createService();

      const result = await service.handleTenantCredentialsReady({
        ...payload,
        planId: 'platinum',
      });

      expect(result).toBeInstanceOf(Nack);
      expect((result as Nack).requeue).toBe(false);
      expect(amqp.publish).not.toHaveBeenCalled();
    });
  });
});
