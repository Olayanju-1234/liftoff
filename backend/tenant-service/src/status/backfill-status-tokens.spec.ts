import type { PrismaClient } from '.prisma/tenant-client';
import { backfillStatusTokens } from './backfill-status-tokens';
import { deriveStatusToken, hashStatusToken } from './status-token';

describe('backfillStatusTokens', () => {
  const secret = 's'.repeat(40);
  const build = (rows: { id: string; statusTokenHash: string | null }[]) => {
    const prisma = {
      tenant: {
        findMany: jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve(
              rows
                .filter((r) => r.statusTokenHash === null)
                .map(({ id }) => ({ id })),
            ),
          ),
        updateMany: jest
          .fn()
          .mockImplementation(
            ({
              where,
              data,
            }: {
              where: { id: string; statusTokenHash: null };
              data: { statusTokenHash: string };
            }) => {
              const row = rows.find(
                (r) => r.id === where.id && r.statusTokenHash === null,
              );
              if (row) {
                row.statusTokenHash = data.statusTokenHash;
              }
              return Promise.resolve({ count: row ? 1 : 0 });
            },
          ),
      },
    };
    return prisma as unknown as PrismaClient & typeof prisma;
  };

  it('fills in the hash of the derived token for tenants without one, leaving the rest alone', async () => {
    const rows = [
      { id: 't1', statusTokenHash: null },
      { id: 't2', statusTokenHash: 'already' },
      { id: 't3', statusTokenHash: null },
    ];

    await expect(backfillStatusTokens(build(rows), secret)).resolves.toBe(2);

    expect(rows.map((r) => r.statusTokenHash)).toEqual([
      hashStatusToken(deriveStatusToken(secret, 't1')),
      'already',
      hashStatusToken(deriveStatusToken(secret, 't3')),
    ]);
  });

  it('is a no-op on a second run', async () => {
    const prisma = build([{ id: 't1', statusTokenHash: null }]);

    await backfillStatusTokens(prisma, secret);
    await expect(backfillStatusTokens(prisma, secret)).resolves.toBe(0);
    expect(prisma.tenant.updateMany).toHaveBeenCalledTimes(1);
  });
});
