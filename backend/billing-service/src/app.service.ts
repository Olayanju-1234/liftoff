import { Injectable, Logger } from '@nestjs/common';
import {
  RabbitSubscribe,
  AmqpConnection,
  Nack,
} from '@golevelup/nestjs-rabbitmq';
import Stripe from 'stripe';
import * as sharedTypes from '@liftoff/shared-types';

/**
 * Map plan IDs to Stripe Price IDs.
 * These should be created in your Stripe dashboard and set via environment variables.
 */
const PLAN_PRICE_MAP: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_STARTER ?? '',
  pro: process.env.STRIPE_PRICE_PRO ?? '',
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE ?? '',
};

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private readonly stripe: Stripe;

  constructor(private readonly amqpConnection: AmqpConnection) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }

    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-03-31.basil',
    });
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
    this.logger.log(`Creating Stripe subscription for tenant ${payload.tenantId}, plan=${payload.planId}`);

    try {
      // Step 1: Create a Stripe Customer for this tenant
      const customer = await this.stripe.customers.create({
        email: payload.adminEmail,
        name: payload.tenantId,
        metadata: {
          tenantId: payload.tenantId,
          subdomain: payload.subdomain,
          planId: payload.planId,
        },
      });

      this.logger.log(`Stripe customer created: ${customer.id} for tenant ${payload.tenantId}`);

      // Step 2: Look up the Price ID for this plan
      const priceId = PLAN_PRICE_MAP[payload.planId];
      if (!priceId) {
        throw new Error(`No Stripe Price ID configured for plan: ${payload.planId}`);
      }

      // Step 3: Create the subscription with a 14-day trial
      const subscription = await this.stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: priceId }],
        trial_period_days: 14,
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

      this.logger.log(`Stripe subscription created: ${subscription.id} (status=${subscription.status}) for tenant ${payload.tenantId}`);

      // Step 4: Publish billing.active so the next pipeline stage proceeds
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
    } catch (error: any) {
      this.logger.error(
        `Failed to create Stripe subscription for tenant ${payload.tenantId}: ${error.message}`,
        error.stack,
      );
      return new Nack(false);
    }
  }
}
