import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'crypto';
import { Prisma } from '.prisma/tenant-client';

import { EMAIL_CHANGE_TTL_MS, SettingsService } from './settings.service';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email/email.service';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  deletedAt: Date | null;
  emailVerified: boolean;
  pendingEmail: string | null;
  verificationToken: string | null;
  verificationExpiry: Date | null;
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

const knownError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError(code, {
    code,
    clientVersion: 'test',
    meta,
  });

const user = (id: string, email: string, name: string | null): UserRow => ({
  id,
  email,
  name,
  deletedAt: null,
  emailVerified: false,
  pendingEmail: null,
  verificationToken: null,
  verificationExpiry: null,
});

// Answers the service's queries the way Postgres would for these rows.
const buildPrisma = (users: UserRow[], settings: SettingsRow[]) => {
  const settingsOf = (userId: string) =>
    settings.find((s) => s.userId === userId) ?? null;

  const client = {
    user: {
      findUnique: jest.fn(({ where }: Prisma.UserFindUniqueArgs) => {
        const row =
          where.email !== undefined
            ? users.find((u) => u.email === where.email)
            : users.find(
                (u) => u.id === where.id && u.deletedAt === where.deletedAt,
              );
        return Promise.resolve(
          row ? { ...row, settings: settingsOf(row.id) } : null,
        );
      }),
      findFirst: jest.fn(({ where }: Prisma.UserFindFirstArgs) => {
        const row = users.find(
          (u) =>
            u.verificationToken === where?.verificationToken &&
            u.deletedAt === where?.deletedAt,
        );
        return Promise.resolve(row ? { ...row } : null);
      }),
      update: jest.fn(({ where, data }: Prisma.UserUpdateArgs) => {
        const row = users.find(
          (u) =>
            u.id === where.id &&
            (where.verificationToken === undefined ||
              u.verificationToken === where.verificationToken),
        );
        if (!row) {
          return Promise.reject(knownError('P2025'));
        }
        const email = data.email as string | undefined;
        if (email && users.some((u) => u.id !== row.id && u.email === email)) {
          return Promise.reject(knownError('P2002', { target: ['email'] }));
        }
        Object.assign(row, strip(data));
        return Promise.resolve({ ...row });
      }),
      updateMany: jest.fn(({ where, data }: Prisma.UserUpdateManyArgs) => {
        const rows = users.filter(
          (u) =>
            u.id === where?.id &&
            u.verificationToken === where?.verificationToken,
        );
        rows.forEach((u) => Object.assign(u, strip(data)));
        return Promise.resolve({ count: rows.length });
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
  };
  return {
    ...client,
    $transaction: jest.fn(
      <T>(fn: (tx: typeof client) => Promise<T>): Promise<T> => fn(client),
    ),
  };
};

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: ReturnType<typeof buildPrisma>;
  let email: {
    sendEmailChangeConfirmation: jest.Mock<Promise<boolean>, [string, string]>;
  };
  let users: UserRow[];
  let settings: SettingsRow[];

  const sentToken = (call = 0) =>
    email.sendEmailChangeConfirmation.mock.calls[call][1];

  beforeEach(async () => {
    users = [
      user('alice', 'alice@acme.io', 'Alice Smith'),
      user('bob', 'bob@globex.io', 'Bob'),
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
    email = {
      sendEmailChangeConfirmation: jest
        .fn<Promise<boolean>, [string, string]>()
        .mockResolvedValue(true),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: email },
      ],
    }).compile();

    service = moduleRef.get(SettingsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getSettings', () => {
    it("returns each caller's own row and email", async () => {
      await expect(service.getSettings('alice')).resolves.toEqual({
        id: 'settings-alice',
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@acme.io',
        pendingEmail: null,
        emailNotifications: true,
        failedJobAlerts: false,
      });
      await expect(service.getSettings('bob')).resolves.toEqual({
        id: 'settings-bob',
        firstName: 'Bob',
        lastName: 'Jones',
        email: 'bob@globex.io',
        pendingEmail: null,
        emailNotifications: false,
        failedJobAlerts: true,
      });
      expect(prisma.settings.upsert).not.toHaveBeenCalled();
    });

    it('creates the row on first GET with names from the user', async () => {
      users.push(user('carol', 'carol@initech.io', 'Carol Ann Lee'));

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
        pendingEmail: null,
        emailNotifications: true,
        failedJobAlerts: true,
      });
      expect(settings.filter((s) => s.userId === 'carol')).toHaveLength(1);
      expect(users).toHaveLength(3);
    });

    it('defaults to empty names when the user has none', async () => {
      users.push(user('dan', 'dan@x.io', null));

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
    it("changes only the caller's row", async () => {
      const result = await service.updateSettings('alice', {
        firstName: 'Alicia',
        failedJobAlerts: true,
      });

      expect(result).toEqual({
        id: 'settings-alice',
        firstName: 'Alicia',
        lastName: 'Smith',
        email: 'alice@acme.io',
        pendingEmail: null,
        emailNotifications: true,
        failedJobAlerts: true,
      });
      expect(prisma.settings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'alice' } }),
      );
      await expect(service.getSettings('bob')).resolves.toMatchObject({
        firstName: 'Bob',
        lastName: 'Jones',
        email: 'bob@globex.io',
      });
    });

    it('keeps the current email until the new one is confirmed', async () => {
      const result = await service.updateSettings('alice', {
        firstName: 'Alicia',
        email: 'alicia@acme.io',
      });

      expect(result).toMatchObject({
        firstName: 'Alicia',
        email: 'alice@acme.io',
        pendingEmail: 'alicia@acme.io',
      });
      expect(users[0]).toMatchObject({
        email: 'alice@acme.io',
        emailVerified: false,
        pendingEmail: 'alicia@acme.io',
      });
      expect(email.sendEmailChangeConfirmation).toHaveBeenCalledWith(
        'alicia@acme.io',
        expect.any(String),
      );
      // The link carries the raw token; only its hash is stored.
      expect(sentToken()).toHaveLength(43);
      expect(users[0].verificationToken).toBe(
        createHash('sha256').update(sentToken()).digest('hex'),
      );
      await expect(service.getSettings('alice')).resolves.toMatchObject({
        email: 'alice@acme.io',
        pendingEmail: 'alicia@acme.io',
      });
    });

    it('starts no change when the email is the current one', async () => {
      const result = await service.updateSettings('alice', {
        lastName: 'Smythe',
        email: 'alice@acme.io',
      });

      expect(result).toMatchObject({
        lastName: 'Smythe',
        email: 'alice@acme.io',
        pendingEmail: null,
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(email.sendEmailChangeConfirmation).not.toHaveBeenCalled();
    });

    it('keeps a pending change when a later save resends the current email', async () => {
      await service.updateSettings('alice', { email: 'alicia@acme.io' });

      const result = await service.updateSettings('alice', {
        firstName: 'Ali',
        email: 'alice@acme.io',
      });

      expect(result.pendingEmail).toBe('alicia@acme.io');
      expect(users[0].pendingEmail).toBe('alicia@acme.io');
      expect(email.sendEmailChangeConfirmation).toHaveBeenCalledTimes(1);
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
      users.push(user('carol', 'carol@initech.io', 'Carol Lee'));

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

    it('409s when the email belongs to another account', async () => {
      await expect(
        service.updateSettings('alice', {
          firstName: 'Mallory',
          email: 'bob@globex.io',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(users[0]).toMatchObject({
        email: 'alice@acme.io',
        pendingEmail: null,
        verificationToken: null,
      });
      expect(settings[0].firstName).toBe('Alice');
      expect(email.sendEmailChangeConfirmation).not.toHaveBeenCalled();
    });

    it('409s when a soft-deleted account still holds the email', async () => {
      users[1].deletedAt = new Date();

      await expect(
        service.updateSettings('alice', { email: 'bob@globex.io' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(users[0].pendingEmail).toBeNull();
    });

    it('drops the pending change when the email cannot be sent', async () => {
      email.sendEmailChangeConfirmation.mockResolvedValueOnce(false);

      await expect(
        service.updateSettings('alice', {
          firstName: 'Alicia',
          email: 'alicia@acme.io',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(users[0]).toMatchObject({
        email: 'alice@acme.io',
        pendingEmail: null,
        verificationToken: null,
        verificationExpiry: null,
      });
      expect(settings[0].firstName).toBe('Alicia');
    });

    it('404s for an unknown user without writing', async () => {
      await expect(
        service.updateSettings('ghost', { firstName: 'Boo' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('confirmEmailChange', () => {
    it('swaps in the new email and clears the pending change', async () => {
      await service.updateSettings('alice', { email: 'alicia@acme.io' });

      await expect(service.confirmEmailChange(sentToken())).resolves.toEqual({
        id: 'alice',
        email: 'alicia@acme.io',
      });

      expect(users[0]).toMatchObject({
        email: 'alicia@acme.io',
        emailVerified: true,
        pendingEmail: null,
        verificationToken: null,
        verificationExpiry: null,
      });
      await expect(service.getSettings('alice')).resolves.toMatchObject({
        email: 'alicia@acme.io',
        pendingEmail: null,
      });
      expect(users[1].email).toBe('bob@globex.io');
    });

    it('rejects a link that was already used', async () => {
      await service.updateSettings('alice', { email: 'alicia@acme.io' });
      await service.confirmEmailChange(sentToken());

      await expect(
        service.confirmEmailChange(sentToken()),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unknown token', async () => {
      await expect(
        service.confirmEmailChange('not-a-real-token'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects an expired link and keeps the current email', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-16T12:00:00Z') });
      await service.updateSettings('alice', { email: 'alicia@acme.io' });

      jest.setSystemTime(Date.now() + EMAIL_CHANGE_TTL_MS + 1);

      await expect(service.confirmEmailChange(sentToken())).rejects.toThrow(
        /expired/,
      );
      expect(users[0].email).toBe('alice@acme.io');
      await expect(service.getSettings('alice')).resolves.toMatchObject({
        email: 'alice@acme.io',
        pendingEmail: null,
      });
    });

    it('rejects the first link once a newer change replaced it', async () => {
      await service.updateSettings('alice', { email: 'first@acme.io' });
      await service.updateSettings('alice', { email: 'second@acme.io' });

      await expect(
        service.confirmEmailChange(sentToken(0)),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.confirmEmailChange(sentToken(1))).resolves.toEqual({
        id: 'alice',
        email: 'second@acme.io',
      });
    });

    it('409s when another account took the email before confirmation', async () => {
      await service.updateSettings('alice', { email: 'shared@acme.io' });
      users[1].email = 'shared@acme.io';

      await expect(
        service.confirmEmailChange(sentToken()),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(users[0].email).toBe('alice@acme.io');
    });

    it("ignores a soft-deleted user's link", async () => {
      await service.updateSettings('alice', { email: 'alicia@acme.io' });
      users[0].deletedAt = new Date();

      await expect(
        service.confirmEmailChange(sentToken()),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(users[0].email).toBe('alice@acme.io');
    });
  });
});
