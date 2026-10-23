import { Logger } from '@nestjs/common';
import { PrismaClient } from '.prisma/tenant-client';
import { PLAN_IDS } from '@liftoff/shared-types';
import { LEGACY_PLAN_IDS, PLAN_CATALOG } from '../src/tenants/plans';
import { backfillTenantOwners } from '../src/tenants/backfill-owners';
import { backfillOrganisations } from '../src/organisations/backfill-organisations';
import { backfillSchemaNames } from '../src/tenants/backfill-schema-names';
import { backfillStatusTokens } from '../src/status/backfill-status-tokens';
import { seedDemoOrganisation } from '../src/demo/seed-demo-organisation';

const prisma = new PrismaClient();
const logger = new Logger('Seed');

async function seedPlan(id: (typeof PLAN_IDS)[number]) {
  const defaults = PLAN_CATALOG[id];
  const legacyId = LEGACY_PLAN_IDS[id];
  const [current, legacy] = await Promise.all([
    prisma.plan.findUnique({ where: { id } }),
    prisma.plan.findUnique({ where: { id: legacyId } }),
  ]);

  if (legacy && !current) {
    // Tenant.planId follows the rename through ON UPDATE CASCADE.
    return prisma.plan.update({
      where: { id: legacyId },
      data: { id, ...defaults },
    });
  }

  if (legacy && current) {
    await prisma.tenant.updateMany({
      where: { planId: legacyId },
      data: { planId: id },
    });
    await prisma.plan.delete({ where: { id: legacyId } });
  }

  return prisma.plan.upsert({
    where: { id },
    update: {},
    create: { id, ...defaults },
  });
}

async function main() {
  logger.log('Seeding plans');
  for (const id of PLAN_IDS) {
    const plan = await seedPlan(id);
    logger.log(`Plan ${JSON.stringify(plan)}`);
  }

  // Owners first: the organisation backfill moves a user's owned tenants with them.
  const owned = await backfillTenantOwners(prisma);
  logger.log(`Backfilled owners on ${owned} tenant(s)`);

  const orgs = await backfillOrganisations(prisma);
  logger.log(`Backfilled organisations ${JSON.stringify(orgs)}`);

  const schemas = await backfillSchemaNames(prisma);
  logger.log(`Backfilled schema names on ${schemas} tenant(s)`);

  const demo = await seedDemoOrganisation(prisma);
  logger.log(`Demo organisation ${JSON.stringify(demo)}`);

  const statusSecret =
    process.env.STATUS_TOKEN_SECRET?.trim() || process.env.JWT_SECRET?.trim();
  if (statusSecret) {
    const tokens = await backfillStatusTokens(prisma, statusSecret);
    logger.log(`Backfilled status tokens on ${tokens} tenant(s)`);
  } else {
    logger.warn(
      'STATUS_TOKEN_SECRET and JWT_SECRET are both unset: status tokens not backfilled',
    );
  }
}

main()
  .catch((e: unknown) => {
    logger.error(
      `Seeding failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
