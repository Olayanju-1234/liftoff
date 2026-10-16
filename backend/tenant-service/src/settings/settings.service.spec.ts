import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '.prisma/tenant-client';

import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma.service';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  deletedAt: Date | null;
}

interface SettingsRow {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  emailNotifications: boolean;
  failedJobAlerts: boolean;
}

type Defined<T> = { [K in keyof T]: Exclude<T[K], undefined> };

const strip = <T extends object>(values: T) =>
  Object.fromEntries(
    Object.entries(values).filter(([, v]) => v !== undefined),
  ) as Partial<Defined<T>>;

const p2002 = (target: string[]) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });

// Answers the service's queries the way Postgres would for these rows.
const buildPrisma = (users: UserRow[], settings: SettingsRow[]) => {
  const settingsOf = (userId: string) =>
    settings.find((s) => s.userId === userId) ?? null;

  const prisma = {
    user: {
      findUnique: jest.fn(({ where }: Prisma.UserFindUniqueArgs) => {
        const user = users.find(
          (u) => u.id === where.id && u.deletedAt === where.deletedAt,
        );
        return Promise.resolve(
          user && { ...user, settings: settingsOf(user.id) },
        );
      }),
      update: jest.fn(({ where, data }: Prisma.UserUpdateArgs) => {
        const user = users.find((u) => u.id === where.id);
        if (!user) {
          return Promise.reject(new Error('P2025'));
        }
        const email = data.email as string | undefined;
        if (email && users.some((u) => u.id !== user.id && u.email === email)) {
          return Promise.reject(p2002(['email']));
        }
        user.email = email ?? user.email;
        return Promise.resolve({ email: user.email });
      }),
    },
    settings: {
      upsert: jest.fn(
        ({ where, create, update }: Prisma.SettingsUpsertArgs) => {
          const existing = settingsOf(where.userId as string);
          if (existing) {
            Object.assign(existing, strip(update));
            return Promise.resolve({ ...existing });
          }
          const row: SettingsRow = {
            id: `settings-${settings.length + 1}`,
            userId: create.userId as string,
            firstName: create.firstName ?? '',
            lastName: create.lastName ?? '',
            emailNotifications: create.emailNotifications ?? true,
            failedJobAlerts: create.failedJobAlerts ?? true,
          };
          settings.push(row);
          return Promise.resolve({ ...row });
        },
      ),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return prisma;
};

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: ReturnType<typeof buildPrisma>;
  let users: UserRow[];
  let settings: SettingsRow[];

  beforeEach(async () => {
    users = [
      {
        id: 'alice',
        email: 'alice@acme.io',
        name: 'Alice Smith',
        deletedAt: null,
      },
      { id: 'bob', email: 'bob@globex.io', name: 'Bob', deletedAt: null },
    ];
    settings = [
      {
        id: 'settings-alice',
        userId: 'alice',
        firstName: 'Alice',
        lastName: 'Smith',
        emailNotifications: true,
        failedJobAlerts: false,
      },
      {
        id: 'settings-bob',
        userId: 'bob',
        firstName: 'Bob',
        lastName: 'Jones',
        emailNotifications: false,
        failedJobAlerts: true,
      },
    ];
    prisma = buildPrisma(users, settings);

    const moduleRef = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(SettingsService);
  });

  describe('getSettings', () => {
    it("returns each caller's own row and email", async () => {
      await expect(service.getSettings('alice')).resolves.toEqual({
        id: 'settings-alice',
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@acme.io',
        emailNotifications: true,
        failedJobAlerts: false,
      });
      await expect(service.getSettings('bob')).resolves.toEqual({
        id: 'settings-bob',
        firstName: 'Bob',
        lastName: 'Jones',
        email: 'bob@globex.io',
        emailNotifications: false,
        failedJobAlerts: true,
      });
      expect(prisma.settings.upsert).not.toHaveBeenCalled();
    });

    it('creates the row on first GET with names from the user', async () => {
      users.push({
        id: 'carol',
        email: 'carol@initech.io',
        name: 'Carol Ann Lee',
        deletedAt: null,
      });

      const result = await service.getSettings('carol');

      expect(prisma.settings.upsert).toHaveBeenCalledWith({
        where: { userId: 'carol' },
        create: { userId: 'carol', firstName: 'Carol', lastName: 'Ann Lee' },
        update: {},
      });
      expect(result).toEqual({
        id: 'settings-3',
        firstName: 'Carol',
        lastName: 'Ann Lee',
        email: 'carol@initech.io',
        emailNotifications: true,
        failedJobAlerts: true,
      });
      expect(settings.filter((s) => s.userId === 'carol')).toHaveLength(1);
      expect(users).toHaveLength(3);
    });

    it('defaults to empty names when the user has none', async () => {
      users.push({ id: 'dan', email: 'dan@x.io', name: null, deletedAt: null });

      await expect(service.getSettings('dan')).resolves.toMatchObject({
        firstName: '',
        lastName: '',
        email: 'dan@x.io',
      });
    });

    it('404s for an unknown or soft-deleted user', async () => {
      users[0].deletedAt = new Date();

      await expect(service.getSettings('alice')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.getSettings('ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.settings.upsert).not.toHaveBeenCalled();
    });
  });

  describe('updateSettings', () => {
    it("changes only the caller's row and email", async () => {
      const result = await service.updateSettings('alice', {
        firstName: 'Alicia',
        email: 'alicia@acme.io',
        failedJobAlerts: true,
      });

      expect(result).toEqual({
        id: 'settings-alice',
        firstName: 'Alicia',
        lastName: 'Smith',
        email: 'alicia@acme.io',
        emailNotifications: true,
        failedJobAlerts: true,
      });
      expect(prisma.settings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'alice' } }),
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'alice' },
        data: { email: 'alicia@acme.io' },
        select: { email: true },
      });
      await expect(service.getSettings('bob')).resolves.toEqual({
        id: 'settings-bob',
        firstName: 'Bob',
        lastName: 'Jones',
        email: 'bob@globex.io',
        emailNotifications: false,
        failedJobAlerts: true,
      });
    });

    it('leaves fields the caller omitted unchanged', async () => {
      await service.updateSettings('bob', { emailNotifications: true });

      expect(settings[1]).toMatchObject({
        firstName: 'Bob',
        lastName: 'Jones',
        emailNotifications: true,
        failedJobAlerts: true,
      });
      expect(users[1].email).toBe('bob@globex.io');
    });

    it('creates the row when a new user saves before any GET', async () => {
      users.push({
        id: 'carol',
        email: 'carol@initech.io',
        name: 'Carol Lee',
        deletedAt: null,
      });

      const result = await service.updateSettings('carol', {
        lastName: 'Nguyen',
        emailNotifications: false,
      });

      expect(result).toMatchObject({
        firstName: 'Carol',
        lastName: 'Nguyen',
        email: 'carol@initech.io',
        emailNotifications: false,
        failedJobAlerts: true,
      });
      expect(settings.filter((s) => s.userId === 'carol')).toHaveLength(1);
    });

    it('409s when the email belongs to another user', async () => {
      await expect(
        service.updateSettings('alice', {
          firstName: 'Mallory',
          email: 'bob@globex.io',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(users[0].email).toBe('alice@acme.io');
      expect(users[1].email).toBe('bob@globex.io');
    });

    it('rethrows other unique violations', async () => {
      prisma.$transaction.mockRejectedValueOnce(p2002(['userId']));

      await expect(
        service.updateSettings('alice', { firstName: 'A' }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('404s for an unknown user without writing', async () => {
      await expect(
        service.updateSettings('ghost', { firstName: 'Boo' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
