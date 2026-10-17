import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  InternalBillingConfig,
  InternalTenantNotification,
} from '@liftoff/shared-types';
import { PrismaService } from '../prisma.service';
import { OrganisationsService } from '../organisations/organisations.service';
import { tenantAddress } from '../tenants/address';

@Injectable()
export class InternalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organisations: OrganisationsService,
  ) {}

  // What billing-service needs to subscribe (or cancel) a tenant in the company's Stripe.
  async billingConfig(tenantId: string): Promise<InternalBillingConfig> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        organisationId: true,
        isTest: true,
        stripeSubscriptionId: true,
      },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} not found`);
    }
    if (!tenant.organisationId) {
      // Legacy rows from before organisations: nobody's Stripe to bill.
      return {
        tenantId: tenant.id,
        organisationId: '',
        test: tenant.isTest,
        stripeSubscriptionId: tenant.stripeSubscriptionId,
        configured: false,
        stripeSecretKey: null,
        prices: { starter: null, pro: null, enterprise: null },
      };
    }
    const stripe = await this.organisations.stripeCredentials(
      tenant.organisationId,
    );
    return {
      tenantId: tenant.id,
      organisationId: tenant.organisationId,
      test: tenant.isTest,
      stripeSubscriptionId: tenant.stripeSubscriptionId,
      ...stripe,
    };
  }

  // Who in the company hears about this tenant, and what the email says. Unverified
  // addresses never get mail: a signup with someone else's email must not be a spam vector.
  async notificationDetails(
    tenantId: string,
  ): Promise<InternalTenantNotification> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        subdomain: true,
        planId: true,
        status: true,
        isTest: true,
        organisation: {
          select: {
            id: true,
            name: true,
            baseDomain: true,
            users: {
              where: { deletedAt: null, emailVerified: true },
              select: {
                email: true,
                settings: {
                  select: { emailNotifications: true, failedJobAlerts: true },
                },
              },
            },
          },
        },
      },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} not found`);
    }
    const { organisation, ...row } = tenant;
    const users = organisation?.users ?? [];
    // No settings row yet means the defaults: both preferences on.
    const ready = users
      .filter((u) => u.settings?.emailNotifications !== false)
      .map((u) => u.email);
    const attention = users
      .filter((u) => u.settings?.failedJobAlerts !== false)
      .map((u) => u.email);
    return {
      tenant: {
        ...row,
        address: tenantAddress(row.subdomain, organisation?.baseDomain),
      },
      organisation: {
        id: organisation?.id ?? '',
        name: organisation?.name ?? '',
      },
      recipients: { ready, attention },
    };
  }
}
