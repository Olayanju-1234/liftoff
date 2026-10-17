import { Injectable, NotFoundException } from '@nestjs/common';
import type { InternalBillingConfig } from '@liftoff/shared-types';
import { PrismaService } from '../prisma.service';
import { OrganisationsService } from '../organisations/organisations.service';

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
      select: { id: true, organisationId: true, isTest: true },
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
      ...stripe,
    };
  }
}
