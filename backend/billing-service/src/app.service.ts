import { Injectable, Logger } from '@nestjs/common';
import {
  RabbitSubscribe,
  AmqpConnection,
  Nack,
} from '@golevelup/nestjs-rabbitmq';
import Stripe from 'stripe';
import * as sharedTypes from '@liftoff/shared-types';
import { InternalApiClient } from './internal-api.client';

const TRIAL_DAYS = 14;
const STRIPE_API_VERSION = '2025-02-24.acacia';

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly amqpConnection: AmqpConnection,
    private readonly internalApi: InternalApiClient,
  ) {}

  // Unbound: tenant-service sends this step's input to the queue when the step is due.
  @RabbitSubscribe({
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
      return this.skipBilling(payload, 'test');
    }

    try {
      // The company's own Stripe account, or nothing: billing is never simulated.
      const config = await this.internalApi.billingConfig(payload.tenantId);
      if (!config.configured || !config.stripeSecretKey) {
        return await this.skipBilling(payload, 'not-connected');
      }

      // Keyed by the company's own customer plan ids; set under Settings → Billing.
      const plan = payload.planId?.toLowerCase() ?? '';
      const priceId = config.prices[plan];
      if (!priceId) {
        throw new Error(
          `No Stripe price configured for plan ${payload.planId}: set it under Settings → Billing`,
        );
      }

      this.logger.log(
        `Creating Stripe subscription for tenant ${payload.tenantId}, plan=${payload.planId}`,
      );
      const stripe = new Stripe(config.stripeSecretKey, {
        apiVersion: STRIPE_API_VERSION,
      });

      const metadata = {
        tenantId: payload.tenantId,
        subdomain: payload.subdomain,
        planId: payload.planId,
        liftoffOrganisationId: config.organisationId,
      };
      // A retried step sends the same keys, and Stripe answers with what it created the
      // first time instead of a second customer or subscription (keys last 24 hours).
      const customer = await stripe.customers.create(
        {
          name: payload.subdomain,
          description: `Liftoff tenant ${payload.tenantId}`,
          metadata,
        },
        { idempotencyKey: `liftoff-${payload.tenantId}-customer` },
      );
      this.logger.log(
        `Stripe customer created: ${customer.id} for tenant ${payload.tenantId}`,
      );

      // The price is part of the key: Stripe refuses a reused key whose request changed,
      // which a company fixing a wrong price before Retry would otherwise run into.
      const subscription = await stripe.subscriptions.create(
        {
          customer: customer.id,
          items: [{ price: priceId }],
          trial_period_days: TRIAL_DAYS,
          metadata,
          payment_settings: {
            save_default_payment_method: 'on_subscription',
          },
        },
        {
          idempotencyKey: `liftoff-${payload.tenantId}-subscription-${priceId}`,
        },
      );
      this.logger.log(
        `Stripe subscription created: ${subscription.id} (status=${subscription.status}) for tenant ${payload.tenantId}`,
      );

      const active: sharedTypes.TenantBillingActivePayload = {
        tenantId: payload.tenantId,
        subdomain: payload.subdomain,
        planId: payload.planId,
        stripeCustomerId: customer.id,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        trialEnd: subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null,
      };
      await this.amqpConnection.publish(
        'provisioning.direct',
        'tenant.billing.active',
        active,
      );
    } catch (error) {
      this.logger.error(
        `Failed to create Stripe subscription for tenant ${payload.tenantId}: ${errorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return new Nack(false);
    }
  }

  // No subscription is created, and the saga still moves on: tenant-service records the
  // step as SKIPPED with this reason.
  private async skipBilling(
    payload: sharedTypes.TenantCredentialsReadyPayload,
    skipReason: sharedTypes.BillingSkipReason,
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
      skipReason,
      ...(payload.test ? { test: true } : {}),
    };
    try {
      await this.amqpConnection.publish(
        'provisioning.direct',
        'tenant.billing.active',
        skipped,
      );
      this.logger.log(
        `Billing skipped (${skipReason}) for tenant ${payload.tenantId}, plan=${payload.planId}`,
      );
      return undefined;
    } catch (error) {
      this.logger.error(
        `Failed to publish the skipped billing for tenant ${payload.tenantId}: ${errorMessage(error)}`,
      );
      return new Nack(false);
    }
  }

  // Cancels the tenant's subscription in the company's Stripe. Safe to replay: a
  // subscription that is already cancelled or gone counts as done.
  @RabbitSubscribe({
    exchange: 'provisioning.direct',
    routingKey: 'tenant.deprovision',
    queue: 'billing-deprovision-queue',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'dlx.provisioning',
      deadLetterRoutingKey: 'billing.deprovision.failed',
    },
  })
  public async handleTenantDeprovision(
    payload: sharedTypes.TenantDeprovisionPayload,
  ) {
    const { tenantId, stripeSubscriptionId: subscriptionId } = payload;
    try {
      const done = subscriptionId
        ? await this.cancelSubscription(tenantId, subscriptionId)
        : {
            tenantId,
            part: 'billing' as const,
            skipped: true,
            detail: 'No subscription to cancel',
          };
      await this.amqpConnection.publish(
        'provisioning.direct',
        'tenant.deprovision.done',
        done,
      );
    } catch (error) {
      this.logger.error(
        `Failed to cancel the subscription of tenant ${tenantId}: ${errorMessage(error)}`,
      );
      return new Nack(false);
    }
  }

  private async cancelSubscription(
    tenantId: string,
    subscriptionId: string,
  ): Promise<sharedTypes.TenantDeprovisionDonePayload> {
    const config = await this.internalApi.billingConfig(tenantId);
    if (!config.configured || !config.stripeSecretKey) {
      // Blocking the removal forever would not help; the company is told what is left.
      return {
        tenantId,
        part: 'billing',
        skipped: true,
        warning: `Stripe is no longer connected, so subscription ${subscriptionId} was not cancelled. Cancel it in your Stripe dashboard.`,
      };
    }
    const stripe = new Stripe(config.stripeSecretKey, {
      apiVersion: STRIPE_API_VERSION,
    });
    try {
      const cancelled = await stripe.subscriptions.cancel(subscriptionId);
      this.logger.log(
        `Cancelled Stripe subscription ${subscriptionId} (status=${cancelled.status}) for tenant ${tenantId}`,
      );
      return {
        tenantId,
        part: 'billing',
        skipped: false,
        detail: subscriptionId,
      };
    } catch (error) {
      if (isMissing(error)) {
        return {
          tenantId,
          part: 'billing',
          skipped: true,
          detail: `Subscription ${subscriptionId} no longer exists in Stripe`,
        };
      }
      // Cancelling twice is an error in Stripe; an already-cancelled subscription is done.
      const current = await stripe.subscriptions.retrieve(subscriptionId);
      if (current.status === 'canceled') {
        return {
          tenantId,
          part: 'billing',
          skipped: false,
          detail: subscriptionId,
        };
      }
      throw error;
    }
  }
}

const isMissing = (error: unknown) =>
  (error as { code?: string } | null)?.code === 'resource_missing';
