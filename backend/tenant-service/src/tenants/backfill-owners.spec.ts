import type { Prisma, PrismaClient } from '.prisma/tenant-client';

import { backfillTenantOwners } from './backfill-owners';

interface TenantRow {
  id: string;
  ownerId: string | null;
}

interface UserRow {
  id: string;
  tenantId: string;
  createdAt: Date;
  deletedAt: Date | null;
}

// Answers the backfill's two queries the way Postgres would for these rows.
const buildPrisma = (tenants: TenantRow[], users: UserRow[]) => {
  const tenant = {
    findMany: jest.fn<Promise<unknown>, [Prisma.TenantFindManyArgs]>(() =>
      Promise.resolve(
        tenants
          .filter((t) => t.ownerId === null)
          .map((t) => ({
            id: t.id,
            users: users
              .filter((u) => u.tenantId === t.id && u.deletedAt === null)
              .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
              .slice(0, 1)
              .map((u) => ({ id: u.id })),
          })),
      ),
    ),
    updateMany: jest.fn<
      Promise<{ count: number }>,
      [Prisma.TenantUpdateManyArgs]
    >(({ where, data }) => {
      const row = tenants.find(
        (t) => t.id === where?.id && t.ownerId === where?.ownerId,
      );
      if (!row) {
        return Promise.resolve({ count: 0 });
      }
      row.ownerId = data.ownerId as string;
      return Promise.resolve({ count: 1 });
    }),
  };
  return { tenant } as unknown as Pick<PrismaClient, 'tenant'> & {
    tenant: typeof tenant;
  };
};

const at = (minute: number) => new Date(Date.UTC(2026, 9, 15, 12, minute));

describe('backfillTenantOwners', () => {
  it('asks only for ownerless tenants and their earliest live user', async () => {
    const prisma = buildPrisma([], []);

    await backfillTenantOwners(prisma);

    expect(prisma.tenant.findMany).toHaveBeenCalledWith({
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
  });

  it('gives each workspace tenant the user whose tenantId points at it', async () => {
    const tenants: TenantRow[] = [
      { id: 'ws-jane', ownerId: null },
      { id: 'ws-sam', ownerId: null },
    ];
    const users: UserRow[] = [
      { id: 'jane', tenantId: 'ws-jane', createdAt: at(0), deletedAt: null },
      { id: 'sam', tenantId: 'ws-sam', createdAt: at(1), deletedAt: null },
    ];

    await expect(
      backfillTenantOwners(buildPrisma(tenants, users)),
    ).resolves.toBe(2);

    expect(tenants).toEqual([
      { id: 'ws-jane', ownerId: 'jane' },
      { id: 'ws-sam', ownerId: 'sam' },
    ]);
  });

  it('picks the registrant over later or deleted users of the same tenant', async () => {
    const tenants: TenantRow[] = [{ id: 'ws', ownerId: null }];
    const users: UserRow[] = [
      { id: 'later', tenantId: 'ws', createdAt: at(30), deletedAt: null },
      { id: 'gone', tenantId: 'ws', createdAt: at(0), deletedAt: at(10) },
      { id: 'registrant', tenantId: 'ws', createdAt: at(1), deletedAt: null },
    ];

    await backfillTenantOwners(buildPrisma(tenants, users));

    expect(tenants[0].ownerId).toBe('registrant');
  });

  it('leaves tenants no user points at without an owner', async () => {
    const tenants: TenantRow[] = [{ id: 'made-via-post', ownerId: null }];
    const prisma = buildPrisma(tenants, []);

    await expect(backfillTenantOwners(prisma)).resolves.toBe(0);

    expect(prisma.tenant.updateMany).not.toHaveBeenCalled();
    expect(tenants[0].ownerId).toBeNull();
  });

  it('never replaces an existing owner, so a rerun changes nothing', async () => {
    const tenants: TenantRow[] = [
      { id: 'ws-jane', ownerId: null },
      { id: 'ws-owned', ownerId: 'original' },
    ];
    const users: UserRow[] = [
      { id: 'jane', tenantId: 'ws-jane', createdAt: at(0), deletedAt: null },
      { id: 'other', tenantId: 'ws-owned', createdAt: at(0), deletedAt: null },
    ];
    const prisma = buildPrisma(tenants, users);

    await expect(backfillTenantOwners(prisma)).resolves.toBe(1);
    await expect(backfillTenantOwners(prisma)).resolves.toBe(0);

    expect(tenants).toEqual([
      { id: 'ws-jane', ownerId: 'jane' },
      { id: 'ws-owned', ownerId: 'original' },
    ]);
    for (const [{ where }] of prisma.tenant.updateMany.mock.calls) {
      expect(where).toMatchObject({ ownerId: null });
    }
  });
});
