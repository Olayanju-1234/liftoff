import type { Prisma, PrismaClient } from '.prisma/tenant-client';
import { HANDLE_PATTERN } from '@liftoff/shared-types';

export interface BackfillResult {
  organisations: number;
  users: number;
  tenants: number;
}

type Tx = Prisma.TransactionClient;

// Before organisations, signup made a "workspace" tenant for the signer's company and
// POST /tenants recorded its creator as ownerId. Each user without an organisation gets one
// named after that workspace tenant, their owned tenants move into it, and the workspace
// tenant is flagged so listings skip it. Users of the same workspace share one organisation.
// Only users without an organisation are touched, so reruns are no-ops.
export async function backfillOrganisations(
  prisma: PrismaClient,
): Promise<BackfillResult> {
  const result: BackfillResult = { organisations: 0, users: 0, tenants: 0 };
  const users = await prisma.user.findMany({
    where: { organisationId: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      email: true,
      name: true,
      tenant: { select: { id: true, name: true, subdomain: true } },
    },
  });

  for (const user of users) {
    await prisma.$transaction(async (tx) => {
      const workspace = user.tenant;
      // Re-read: an earlier user of the same workspace may just have created its organisation.
      let organisationId = workspace
        ? ((
            await tx.tenant.findUnique({
              where: { id: workspace.id },
              select: { organisationId: true },
            })
          )?.organisationId ?? null)
        : null;
      if (!organisationId) {
        const organisation = await tx.organisation.create({
          data: {
            name: workspace?.name ?? user.name ?? user.email,
            handle: await freeHandle(
              tx,
              workspace?.subdomain ?? user.email.split('@')[0],
            ),
          },
          select: { id: true },
        });
        organisationId = organisation.id;
        result.organisations++;
        if (workspace) {
          await tx.tenant.update({
            where: { id: workspace.id },
            data: { organisationId, isWorkspace: true },
          });
          result.tenants++;
        }
      }

      await tx.user.update({
        where: { id: user.id },
        data: { organisationId },
      });
      result.users++;

      const owned = await tx.tenant.updateMany({
        where: { ownerId: user.id, organisationId: null },
        data: { organisationId },
      });
      result.tenants += owned.count;
    });
  }
  return result;
}

export function toHandle(raw: string): string {
  const handle = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return HANDLE_PATTERN.test(handle) && handle.length >= 3
    ? handle
    : `org-${handle || 'x'}`.replace(/-+$/g, '');
}

// Workspace subdomains were unique, but a handle taken since signup gets a numeric suffix.
async function freeHandle(tx: Tx, raw: string): Promise<string> {
  const base = toHandle(raw);
  for (let n = 0; ; n++) {
    const handle = n === 0 ? base : `${base}-${n + 1}`;
    const taken = await tx.organisation.findUnique({
      where: { handle },
      select: { id: true },
    });
    if (!taken) {
      return handle;
    }
  }
}
