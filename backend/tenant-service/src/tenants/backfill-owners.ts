import type { PrismaClient } from '.prisma/tenant-client';

// Register creates the workspace tenant and its user together, so the earliest live
// user pointing at a tenant is its registrant. Owned tenants are skipped, so reruns are no-ops.
export async function backfillTenantOwners(
  prisma: Pick<PrismaClient, 'tenant'>,
): Promise<number> {
  const ownerless = await prisma.tenant.findMany({
    where: { ownerId: null },
    select: {
      id: true,
      users: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 1,
        select: { id: true },
      },
    },
  });

  const results = await Promise.all(
    ownerless
      .filter((tenant) => tenant.users.length > 0)
      .map((tenant) =>
        prisma.tenant.updateMany({
          where: { id: tenant.id, ownerId: null },
          data: { ownerId: tenant.users[0].id },
        }),
      ),
  );
  return results.reduce((filled, { count }) => filled + count, 0);
}
