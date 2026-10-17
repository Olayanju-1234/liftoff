import type { PrismaClient } from '.prisma/tenant-client';

import { backfillOrganisations, toHandle } from './backfill-organisations';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  tenantId: string | null;
  organisationId: string | null;
  createdAt: Date;
}

interface TenantRow {
  id: string;
  name: string;
  subdomain: string;
  ownerId: string | null;
  organisationId: string | null;
  isWorkspace: boolean;
}

interface OrgRow {
  id: string;
  name: string;
  handle: string;
}

// An in-memory stand-in that answers the backfill's queries the way Postgres would.
const buildDb = (
  users: UserRow[],
  tenants: TenantRow[],
  orgs: OrgRow[] = [],
) => {
  let nextOrg = orgs.length + 1;
  const tx = {
    organisation: {
      create: jest.fn(
        ({ data }: { data: { name: string; handle: string } }) => {
          if (orgs.some((o) => o.handle === data.handle)) {
            return Promise.reject(
              new Error(`unique violation on handle ${data.handle}`),
            );
          }
          const row = { id: `org-${nextOrg++}`, ...data };
          orgs.push(row);
          return Promise.resolve({ id: row.id });
        },
      ),
      findUnique: jest.fn(({ where }: { where: { handle: string } }) =>
        Promise.resolve(orgs.find((o) => o.handle === where.handle) ?? null),
      ),
    },
    tenant: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) => {
        const row = tenants.find((t) => t.id === where.id);
        return Promise.resolve(
          row ? { organisationId: row.organisationId } : null,
        );
      }),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<TenantRow>;
        }) => {
          const row = tenants.find((t) => t.id === where.id);
          if (!row) return Promise.reject(new Error('P2025'));
          Object.assign(row, data);
          return Promise.resolve(row);
        },
      ),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { ownerId: string; organisationId: null };
          data: { organisationId: string };
        }) => {
          const rows = tenants.filter(
            (t) => t.ownerId === where.ownerId && t.organisationId === null,
          );
          rows.forEach((t) => Object.assign(t, data));
          return Promise.resolve({ count: rows.length });
        },
      ),
    },
    user: {
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: { organisationId: string };
        }) => {
          const row = users.find((u) => u.id === where.id);
          if (!row) return Promise.reject(new Error('P2025'));
          Object.assign(row, data);
          return Promise.resolve(row);
        },
      ),
    },
  };
  const prisma = {
    user: {
      findMany: jest.fn(() =>
        Promise.resolve(
          users
            .filter((u) => u.organisationId === null)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .map((u) => {
              const t = tenants.find((row) => row.id === u.tenantId);
              return {
                id: u.id,
                email: u.email,
                name: u.name,
                tenant: t
                  ? { id: t.id, name: t.name, subdomain: t.subdomain }
                  : null,
              };
            }),
        ),
      ),
    },
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  };
  return { prisma: prisma as unknown as PrismaClient, tx, orgs };
};

const at = (minute: number) => new Date(Date.UTC(2026, 9, 17, 9, minute));

describe('backfillOrganisations', () => {
  it('gives each user an organisation named after their workspace tenant and moves their tenants into it', async () => {
    const users: UserRow[] = [
      {
        id: 'jane',
        email: 'jane@acme.com',
        name: 'Jane',
        tenantId: 'ws-acme',
        organisationId: null,
        createdAt: at(0),
      },
    ];
    const tenants: TenantRow[] = [
      {
        id: 'ws-acme',
        name: 'Acme Corp',
        subdomain: 'acme',
        ownerId: 'jane',
        organisationId: null,
        isWorkspace: false,
      },
      {
        id: 'cust-1',
        name: 'Globex',
        subdomain: 'globex',
        ownerId: 'jane',
        organisationId: null,
        isWorkspace: false,
      },
      {
        id: 'orphan',
        name: 'Nobody',
        subdomain: 'nobody',
        ownerId: null,
        organisationId: null,
        isWorkspace: false,
      },
    ];
    const { prisma, orgs } = buildDb(users, tenants);

    await expect(backfillOrganisations(prisma)).resolves.toEqual({
      organisations: 1,
      users: 1,
      tenants: 2,
    });

    expect(orgs).toEqual([{ id: 'org-1', name: 'Acme Corp', handle: 'acme' }]);
    expect(users[0].organisationId).toBe('org-1');
    expect(tenants[0]).toMatchObject({
      organisationId: 'org-1',
      isWorkspace: true,
    });
    expect(tenants[1]).toMatchObject({
      organisationId: 'org-1',
      isWorkspace: false,
    });
    // Nothing recorded who made it, so it stays hidden rather than guessed.
    expect(tenants[2]).toMatchObject({
      organisationId: null,
      isWorkspace: false,
    });
  });

  it('puts users who share a workspace tenant in the same organisation', async () => {
    const users: UserRow[] = [
      {
        id: 'jane',
        email: 'jane@acme.com',
        name: 'Jane',
        tenantId: 'ws-acme',
        organisationId: null,
        createdAt: at(0),
      },
      {
        id: 'sam',
        email: 'sam@acme.com',
        name: 'Sam',
        tenantId: 'ws-acme',
        organisationId: null,
        createdAt: at(5),
      },
    ];
    const tenants: TenantRow[] = [
      {
        id: 'ws-acme',
        name: 'Acme Corp',
        subdomain: 'acme',
        ownerId: 'jane',
        organisationId: null,
        isWorkspace: false,
      },
      {
        id: 'cust-sam',
        name: 'Initech',
        subdomain: 'initech',
        ownerId: 'sam',
        organisationId: null,
        isWorkspace: false,
      },
    ];
    const { prisma, orgs } = buildDb(users, tenants);

    await expect(backfillOrganisations(prisma)).resolves.toEqual({
      organisations: 1,
      users: 2,
      tenants: 2,
    });

    expect(orgs).toHaveLength(1);
    expect(users.map((u) => u.organisationId)).toEqual(['org-1', 'org-1']);
    expect(tenants[1].organisationId).toBe('org-1');
  });

  it('is idempotent: a second run touches nothing', async () => {
    const users: UserRow[] = [
      {
        id: 'jane',
        email: 'jane@acme.com',
        name: 'Jane',
        tenantId: 'ws-acme',
        organisationId: null,
        createdAt: at(0),
      },
    ];
    const tenants: TenantRow[] = [
      {
        id: 'ws-acme',
        name: 'Acme Corp',
        subdomain: 'acme',
        ownerId: 'jane',
        organisationId: null,
        isWorkspace: false,
      },
    ];
    const { prisma, tx, orgs } = buildDb(users, tenants);

    await backfillOrganisations(prisma);
    const after = JSON.stringify({ users, tenants, orgs });
    jest.clearAllMocks();

    await expect(backfillOrganisations(prisma)).resolves.toEqual({
      organisations: 0,
      users: 0,
      tenants: 0,
    });
    expect(JSON.stringify({ users, tenants, orgs })).toBe(after);
    expect(tx.organisation.create).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.tenant.findUnique).not.toHaveBeenCalled();
    expect(tx.tenant.update).not.toHaveBeenCalled();
    expect(tx.tenant.updateMany).not.toHaveBeenCalled();
  });

  it('leaves organisations made since the deploy alone and only fills in the gaps', async () => {
    const users: UserRow[] = [
      {
        id: 'new',
        email: 'new@fresh.io',
        name: null,
        tenantId: null,
        organisationId: 'org-1',
        createdAt: at(0),
      },
      {
        id: 'old',
        email: 'old@legacy.io',
        name: 'Old',
        tenantId: 'ws-old',
        organisationId: null,
        createdAt: at(1),
      },
    ];
    const tenants: TenantRow[] = [
      {
        id: 'ws-old',
        name: 'Legacy',
        subdomain: 'legacy',
        ownerId: 'old',
        organisationId: null,
        isWorkspace: false,
      },
    ];
    const { prisma, orgs } = buildDb(users, tenants, [
      { id: 'org-1', name: 'Fresh', handle: 'fresh' },
    ]);

    await expect(backfillOrganisations(prisma)).resolves.toEqual({
      organisations: 1,
      users: 1,
      tenants: 1,
    });
    expect(orgs).toEqual([
      { id: 'org-1', name: 'Fresh', handle: 'fresh' },
      { id: 'org-2', name: 'Legacy', handle: 'legacy' },
    ]);
  });

  it('suffixes a handle a newer organisation already took', async () => {
    const users: UserRow[] = [
      {
        id: 'old',
        email: 'old@acme.io',
        name: 'Old',
        tenantId: 'ws-acme',
        organisationId: null,
        createdAt: at(1),
      },
    ];
    const tenants: TenantRow[] = [
      {
        id: 'ws-acme',
        name: 'Acme',
        subdomain: 'acme',
        ownerId: 'old',
        organisationId: null,
        isWorkspace: false,
      },
    ];
    const { prisma, orgs } = buildDb(users, tenants, [
      { id: 'org-1', name: 'Acme', handle: 'acme' },
      { id: 'org-2', name: 'Acme', handle: 'acme-2' },
    ]);

    await backfillOrganisations(prisma);

    expect(orgs[2]).toEqual({ id: 'org-3', name: 'Acme', handle: 'acme-3' });
  });

  it('falls back to the user when no workspace tenant exists', async () => {
    const users: UserRow[] = [
      {
        id: 'solo',
        email: 'Solo.Dev@example.com',
        name: null,
        tenantId: null,
        organisationId: null,
        createdAt: at(0),
      },
    ];
    const { prisma, orgs } = buildDb(users, []);

    await expect(backfillOrganisations(prisma)).resolves.toEqual({
      organisations: 1,
      users: 1,
      tenants: 0,
    });
    expect(orgs).toEqual([
      { id: 'org-1', name: 'Solo.Dev@example.com', handle: 'solo-dev' },
    ]);
  });

  it.each([
    ['acme', 'acme'],
    ['Acme Corp!', 'acme-corp'],
    ['--Weird__Name--', 'weird-name'],
    ['ab', 'org-ab'],
    ['', 'org-x'],
    ['x'.repeat(60), 'x'.repeat(40)],
  ])('toHandle(%j) is %j', (raw, handle) => {
    expect(toHandle(raw)).toBe(handle);
  });
});
