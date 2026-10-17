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
      return this.skipBilling(payload, 'test');
    }

    try {
      // The company's own Stripe account, or nothing: billing is never simulated.
      const config = await this.internalApi.billingConfig(payload.tenantId);
      if (!config.configured || !config.stripeSecretKey) {
        return await this.skipBilling(payload, 'not-connected');
      }

      const plan = payload.planId?.toLowerCase() as sharedTypes.PlanId;
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
      const customer = await stripe.customers.create({
        name: payload.subdomain,
        description: `Liftoff tenant ${payload.tenantId}`,
        metadata,
      });
      this.logger.log(
        `Stripe customer created: ${customer.id} for tenant ${payload.tenantId}`,
      );

      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: priceId }],
        trial_period_days: TRIAL_DAYS,
        metadata,
        payment_settings: {
          save_default_payment_method: 'on_subscription',
        },
      });
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
}
