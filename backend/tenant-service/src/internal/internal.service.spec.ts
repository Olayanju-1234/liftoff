import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InternalService } from './internal.service';
import { PrismaService } from '../prisma.service';
import { OrganisationsService } from '../organisations/organisations.service';

describe('InternalService', () => {
  let service: InternalService;
  const prisma = { tenant: { findUnique: jest.fn() } };
  const organisations = { stripeCredentials: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        InternalService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrganisationsService, useValue: organisations },
      ],
    }).compile();
    service = moduleRef.get(InternalService);
  });

  it("returns the organisation's decrypted Stripe key and prices for a tenant", async () => {
    prisma.tenant.findUnique.mockResolvedValueOnce({
      id: 't',
      organisationId: 'org-1',
      isTest: false,
    });
    organisations.stripeCredentials.mockResolvedValueOnce({
      configured: true,
      stripeSecretKey: 'sk_test_abcdefghijk',
      prices: { starter: 'price_a', pro: null, enterprise: null },
    });

    await expect(service.billingConfig('t')).resolves.toEqual({
      tenantId: 't',
      organisationId: 'org-1',
      test: false,
      configured: true,
      stripeSecretKey: 'sk_test_abcdefghijk',
      prices: { starter: 'price_a', pro: null, enterprise: null },
    });
    expect(organisations.stripeCredentials).toHaveBeenCalledWith('org-1');
  });

  it('reports not configured for a legacy tenant without an organisation', async () => {
    prisma.tenant.findUnique.mockResolvedValueOnce({
      id: 't',
      organisationId: null,
      isTest: true,
    });

    await expect(service.billingConfig('t')).resolves.toMatchObject({
      configured: false,
      stripeSecretKey: null,
      test: true,
    });
    expect(organisations.stripeCredentials).not.toHaveBeenCalled();
  });

  it('404s for an unknown tenant', async () => {
    prisma.tenant.findUnique.mockResolvedValueOnce(null);
    await expect(service.billingConfig('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
