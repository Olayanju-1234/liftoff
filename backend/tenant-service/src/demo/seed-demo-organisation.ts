import type { PrismaClient } from '.prisma/tenant-client';
import { DEMO_ORGANISATION, DEMO_ORGANISATION_ID } from './demo.constants';

// Created once and never updated, so every step stays builtin with no webhook or Stripe.
export function seedDemoOrganisation(
  prisma: Pick<PrismaClient, 'organisation'>,
) {
  return prisma.organisation.upsert({
    where: { id: DEMO_ORGANISATION_ID },
    update: {},
    create: DEMO_ORGANISATION,
    select: { id: true, name: true, handle: true },
  });
}
