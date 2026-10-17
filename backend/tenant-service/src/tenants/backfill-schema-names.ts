import type { PrismaClient } from '.prisma/tenant-client';
import { legacySchemaName } from './address';

// Tenants from before org-scoped subdomains got their schema from db-provisioner as
// tenant_<subdomain>. Record that name so the row says which schema is really theirs.
// Only rows without a name are touched, so reruns are no-ops.
export async function backfillSchemaNames(
  prisma: PrismaClient,
): Promise<number> {
  const tenants = await prisma.tenant.findMany({
    where: { schemaName: null },
    select: { id: true, subdomain: true },
  });
  let count = 0;
  for (const tenant of tenants) {
    const { count: updated } = await prisma.tenant.updateMany({
      where: { id: tenant.id, schemaName: null },
      data: { schemaName: legacySchemaName(tenant.subdomain) },
    });
    count += updated;
  }
  return count;
}
