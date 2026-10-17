import type { PrismaClient } from '.prisma/tenant-client';
import { deriveStatusToken, hashStatusToken } from './status-token';

// Tenants from before the status page have no token hash, so their statusUrl would 404.
// The token is derived from the id, so the hash can be filled in after the fact. Only
// rows without a hash are touched; reruns are no-ops.
export async function backfillStatusTokens(
  prisma: PrismaClient,
  secret: string,
): Promise<number> {
  const tenants = await prisma.tenant.findMany({
    where: { statusTokenHash: null },
    select: { id: true },
  });
  let count = 0;
  for (const { id } of tenants) {
    const { count: updated } = await prisma.tenant.updateMany({
      where: { id, statusTokenHash: null },
      data: { statusTokenHash: hashStatusToken(deriveStatusToken(secret, id)) },
    });
    count += updated;
  }
  return count;
}
