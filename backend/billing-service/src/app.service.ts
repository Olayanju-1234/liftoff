import { Injectable, Logger } from '@nestjs/common';
import {
  RabbitSubscribe,
  AmqpConnection,
  Nack,
} from '@golevelup/nestjs-rabbitmq';
import Stripe from 'stripe';
import * as sharedTypes from '@liftoff/shared-types';

const TRIAL_DAYS = 14;

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  // Null when no Stripe key is set: billing is then simulated, like DNS provisioning
  private readonly stripe: Stripe | null;
  private readonly planPriceMap: Record<string, string>;

  constructor(private readonly amqpConnection: AmqpConnection) {
    if (!process.env.STRIPE_SECRET_KEY) {
      this.logger.warn(
        'STRIPE_SECRET_KEY is not set, so subscriptions are simulated and Stripe is never called',
      );
      this.stripe = null;
      this.planPriceMap = Object.fromEntries(
        sharedTypes.PLAN_IDS.map((plan) => [plan, `sim_price_${plan}`]),
      );
      return;
    }

    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-02-24.acacia',
    });

    const map: Record<sharedTypes.PlanId, string> = {
      starter: process.env.STRIPE_PRICE_STARTER ?? '',
      pro: process.env.STRIPE_PRICE_PRO ?? '',
      enterprise: process.env.STRIPE_PRICE_ENTERPRISE ?? '',
    };
    const missing = Object.entries(map)
      .filter(([, v]) => !v)
      .map(([k]) => `STRIPE_PRICE_${k.toUpperCase()}`);
    if (missing.length > 0) {
      throw new Error(
        `Missing Stripe Price ID env vars: ${missing.join(', ')}`,
      );
    }
    this.planPriceMap = map;
  }

  @RabbitSubscribe({
    exchange: 'provisioning.direct',
    routingKey: 'tenant.credentials.ready',
    queue: 'billing-queue',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'dlx.provisioning',
      deadLetterRoutingKey: 'billing.failed',
    },
  })
  public async handleTenantCredentialsReady(
    payload: sharedTypes.TenantCredentialsReadyPayload,
  ) {
    if (payload.test) {
      return this.skipBilling(payload);
    }

    this.logger.log(
      `Creating Stripe subscription for tenant ${payload.tenantId}, plan=${payload.planId}`,
    );

    try {
      if (!this.stripe) {
        await this.publishSimulatedSubscription(payload);
        return;
      }

      const customer = await this.stripe.customers.create({
        name: payload.tenantId,
        description: `Tenant: ${payload.subdomain}`,
        metadata: {
          tenantId: payload.tenantId,
          subdomain: payload.subdomain,
          planId: payload.planId,
        },
      });

      this.logger.log(
        `Stripe customer created: ${customer.id} for tenant ${payload.tenantId}`,
      );

      const priceId = this.planPriceMap[payload.planId?.toLowerCase()];
      if (!priceId) {
        throw new Error(
          `No Stripe Price ID configured for plan: ${payload.planId}`,
        );
      }

      const subscription = await this.stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: priceId }],
        trial_period_days: TRIAL_DAYS,
        metadata: {
          tenantId: payload.tenantId,
          subdomain: payload.subdomain,
          planId: payload.planId,
        },
        payment_settings: {
          save_default_payment_method: 'on_subscription',
        },
        expand: ['latest_invoice.payment_intent'],
      });

      this.logger.log(
        `Stripe subscription created: ${subscription.id} (status=${subscription.status}) for tenant ${payload.tenantId}`,
      );

      await this.amqpConnection.publish(
        'provisioning.direct',
        'tenant.billing.active',
        {
          tenantId: payload.tenantId,
          subdomain: payload.subdomain,
          planId: payload.planId,
          stripeCustomerId: customer.id,
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          trialEnd: subscription.trial_end
            ? new Date(subscription.trial_end * 1000).toISOString()
            : null,
        },
      );
    } catch (error) {
      const err = error instanceof Error ? error : undefined;
      this.logger.error(
        `Failed to create Stripe subscription for tenant ${payload.tenantId}: ${err?.message ?? String(error)}`,
        err?.stack,
      );
      return new Nack(false);
    }
  }

  // A test tenant is never billed, real Stripe key or not. The saga still moves on.
  private async skipBilling(
    payload: sharedTypes.TenantCredentialsReadyPayload,
  ): Promise<Nack | undefined> {
    const skipped: sharedTypes.TenantBillingActivePayload = {
      tenantId: payload.tenantId,
      subdomain: payload.subdomain,
      planId: payload.planId,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: 'skipped',
      trialEnd: null,
      skipped: true,
      test: true,
    };
    try {
      await this.amqpConnection.publish(
        'provisioning.direct',
        'tenant.billing.active',
        skipped,
      );
      this.logger.log(
        `Billing skipped for test tenant ${payload.tenantId}, plan=${payload.planId}`,
      );
      return undefined;
    } catch (error) {
      this.logger.error(
        `Failed to publish the skipped billing for test tenant ${payload.tenantId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return new Nack(false);
    }
  }

  private async publishSimulatedSubscription(
    payload: sharedTypes.TenantCredentialsReadyPayload,
  ): Promise<void> {
    if (!this.planPriceMap[payload.planId?.toLowerCase()]) {
      throw new Error(`Unknown plan: ${payload.planId}`);
    }
    const trialEnd = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    await this.amqpConnection.publish(
      'provisioning.direct',
      'tenant.billing.active',
      {
        tenantId: payload.tenantId,
        subdomain: payload.subdomain,
        planId: payload.planId,
        stripeCustomerId: `sim_cus_${payload.tenantId}`,
        stripeSubscriptionId: `sim_sub_${payload.tenantId}`,
        subscriptionStatus: 'trialing',
        trialEnd: trialEnd.toISOString(),
      },
    );
    this.logger.log(
      `Simulated subscription started for tenant ${payload.tenantId}, plan=${payload.planId}`,
    );
  }
}
