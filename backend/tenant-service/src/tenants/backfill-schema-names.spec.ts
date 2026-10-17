import type { PrismaClient } from '.prisma/tenant-client';
import { backfillSchemaNames } from './backfill-schema-names';

describe('backfillSchemaNames', () => {
  const build = (
    rows: { id: string; subdomain: string; schemaName: string | null }[],
  ) => {
    const prisma = {
      tenant: {
        findMany: jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve(rows.filter((r) => r.schemaName === null)),
          ),
        updateMany: jest
          .fn()
          .mockImplementation(
            ({
              where,
              data,
            }: {
              where: { id: string; schemaName: null };
              data: { schemaName: string };
            }) => {
              const row = rows.find(
                (r) => r.id === where.id && r.schemaName === null,
              );
              if (row) {
                row.schemaName = data.schemaName;
              }
              return Promise.resolve({ count: row ? 1 : 0 });
            },
          ),
      },
    };
    return prisma as unknown as PrismaClient & typeof prisma;
  };

  it('names legacy schemas tenant_<subdomain> and leaves named rows alone', async () => {
    const rows = [
      { id: 't1', subdomain: 'globex', schemaName: null },
      { id: 't2', subdomain: 'acme', schemaName: 'tenant_org_acme' },
      { id: 't3', subdomain: 'init', schemaName: null },
    ];
    const prisma = build(rows);

    await expect(backfillSchemaNames(prisma)).resolves.toBe(2);

    expect(rows.map((r) => r.schemaName)).toEqual([
      'tenant_globex',
      'tenant_org_acme',
      'tenant_init',
    ]);
  });

  it('is a no-op on a second run', async () => {
    const rows = [{ id: 't1', subdomain: 'globex', schemaName: null }];
    const prisma = build(rows);

    await backfillSchemaNames(prisma);
    await expect(backfillSchemaNames(prisma)).resolves.toBe(0);
    expect(prisma.tenant.updateMany).toHaveBeenCalledTimes(1);
  });
});
