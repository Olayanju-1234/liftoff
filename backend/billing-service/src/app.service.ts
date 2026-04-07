import { Injectable, Logger } from "@nestjs/common";
import {
  RabbitSubscribe,
  AmqpConnection,
  Nack,
} from "@golevelup/nestjs-rabbitmq";
import Stripe from "stripe";
import * as sharedTypes from "@liftoff/shared-types";

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private readonly stripe: Stripe;
  private readonly planPriceMap: Record<string, string>;

  constructor(private readonly amqpConnection: AmqpConnection) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY environment variable is required");
    }

    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-02-24.acacia",
    });

    const map: Record<string, string> = {
      starter: process.env.STRIPE_PRICE_STARTER ?? "",
      pro: process.env.STRIPE_PRICE_PRO ?? "",
      enterprise: process.env.STRIPE_PRICE_ENTERPRISE ?? "",
    };
    const missing = Object.entries(map)
      .filter(([, v]) => !v)
      .map(([k]) => `STRIPE_PRICE_${k.toUpperCase()}`);
    if (missing.length > 0) {
      throw new Error(
        `Missing Stripe Price ID env vars: ${missing.join(", ")}`,
      );
    }
    this.planPriceMap = map;
  }

  @RabbitSubscribe({
    exchange: "provisioning.direct",
    routingKey: "tenant.credentials.ready",
    queue: "billing-queue",
    queueOptions: {
      durable: true,
      deadLetterExchange: "dlx.provisioning",
      deadLetterRoutingKey: "billing.failed",
    },
  })
  public async handleTenantCredentialsReady(
    payload: sharedTypes.TenantCredentialsReadyPayload,
  ) {
    this.logger.log(
      `Creating Stripe subscription for tenant ${payload.tenantId}, plan=${payload.planId}`,
    );

    try {
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
        trial_period_days: 14,
        metadata: {
          tenantId: payload.tenantId,
          subdomain: payload.subdomain,
          planId: payload.planId,
        },
        payment_settings: {
          save_default_payment_method: "on_subscription",
        },
        expand: ["latest_invoice.payment_intent"],
      });

      this.logger.log(
        `Stripe subscription created: ${subscription.id} (status=${subscription.status}) for tenant ${payload.tenantId}`,
      );

      await this.amqpConnection.publish(
        "provisioning.direct",
        "tenant.billing.active",
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
