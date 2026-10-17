import {
  BadRequestException,
  ConflictException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Prisma } from '.prisma/tenant-client';
import * as bcrypt from 'bcrypt';

import {
  AuthService,
  FORGOT_PASSWORD_MESSAGE,
  PASSWORD_RESET_TTL_MS,
  VERIFICATION_TTL_MS,
} from './auth.service';
import { PrismaService } from '../prisma.service';
import { OrganisationsService } from '../organisations/organisations.service';
import { EmailService } from '../email/email.service';
import { hashToken } from '../common/tokens';

type MockPrisma = {
  user: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    create: jest.Mock<Promise<unknown>, [Prisma.UserCreateArgs]>;
    update: jest.Mock<Promise<unknown>, [Prisma.UserUpdateArgs]>;
    updateMany: jest.Mock<
      Promise<{ count: number }>,
      [Prisma.UserUpdateManyArgs]
    >;
  };
  tenant: { findUnique: jest.Mock; create: jest.Mock };
  plan: { upsert: jest.Mock };
  $transaction: jest.Mock;
};

const buildPrisma = (): MockPrisma => ({
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn<Promise<unknown>, [Prisma.UserCreateArgs]>(),
    update: jest.fn<Promise<unknown>, [Prisma.UserUpdateArgs]>(),
    updateMany: jest
      .fn<Promise<{ count: number }>, [Prisma.UserUpdateManyArgs]>()
      .mockResolvedValue({ count: 1 }),
  },
  tenant: { findUnique: jest.fn(), create: jest.fn() },
  plan: { upsert: jest.fn() },
  $transaction: jest.fn(),
});

describe('AuthService', () => {
  let service: AuthService;
  let prisma: MockPrisma;
  let jwt: { signAsync: jest.Mock; verify: jest.Mock };
  let config: { getOrThrow: jest.Mock; get: jest.Mock };
  let organisations: { assertHandleFree: jest.Mock };
  let email: {
    sendVerificationEmail: jest.Mock;
    sendPasswordResetEmail: jest.Mock;
  };

  const validRegisterDto = {
    email: 'admin@acme.com',
    password: 'CorrectHorse9!',
    name: 'Jane Doe',
    companyName: 'Acme Corp',
    handle: 'acme',
  };

  beforeEach(async () => {
    prisma = buildPrisma();
    jwt = {
      signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
      verify: jest.fn(),
    };
    config = {
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return 'a'.repeat(32);
        if (key === 'JWT_REFRESH_SECRET') return 'b'.repeat(32);
        throw new Error(`unexpected config key: ${key}`);
      }),
      get: jest.fn(),
    };
    organisations = {
      assertHandleFree: jest.fn().mockResolvedValue(undefined),
    };
    email = {
      sendVerificationEmail: jest.fn().mockResolvedValue(true),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
    };
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: OrganisationsService, useValue: organisations },
        { provide: EmailService, useValue: email },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('register', () => {
    const createdUser = {
      id: 'user-1',
      email: validRegisterDto.email,
      name: validRegisterDto.name,
      role: 'ADMIN',
      organisationId: 'org-1',
      tenantId: null,
      emailVerified: false,
    };

    const arrangeRegister = () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      prisma.user.create.mockResolvedValueOnce(createdUser);
      prisma.user.update.mockResolvedValueOnce({});
    };

    it('hashes the password, creates the user with their organisation, and returns tokens', async () => {
      arrangeRegister();

      const result = await service.register(validRegisterDto);

      expect(result.user).toEqual({
        id: 'user-1',
        email: 'admin@acme.com',
        name: 'Jane Doe',
        role: 'ADMIN',
        organisationId: 'org-1',
        tenantId: null,
        emailVerified: false,
      });
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toBe('signed.jwt.token');
      expect(jwt.signAsync).toHaveBeenCalledTimes(2);

      const [[createArgs]] = prisma.user.create.mock.calls;
      expect(createArgs.data).toMatchObject({
        email: 'admin@acme.com',
        role: 'ADMIN',
        organisation: { create: { name: 'Acme Corp', handle: 'acme' } },
      });
      expect(createArgs.data.password).not.toBe('CorrectHorse9!');

      // Refresh token must be stored hashed, never in plaintext.
      const [[updateArgs]] = prisma.user.update.mock.calls;
      expect(updateArgs.where).toEqual({ id: 'user-1' });
      expect(typeof updateArgs.data.refreshToken).toBe('string');
      expect(updateArgs.data.refreshToken).not.toEqual('signed.jwt.token');
    });

    it('provisions no tenant for the signer: the company has no customers yet', async () => {
      arrangeRegister();

      await service.register(validRegisterDto);

      expect(prisma.tenant.create).not.toHaveBeenCalled();
      expect(prisma.plan.upsert).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      const [[createArgs]] = prisma.user.create.mock.calls;
      expect(createArgs.data).not.toHaveProperty('tenant');
      expect(createArgs.data).not.toHaveProperty('tenantId');
    });

    it('puts the organisation id in the JWT', async () => {
      arrangeRegister();

      await service.register(validRegisterDto);

      const [[payload]] = jwt.signAsync.mock.calls as [
        [Record<string, unknown>],
      ];
      expect(payload).toMatchObject({
        sub: 'user-1',
        organisationId: 'org-1',
        tenantId: null,
      });
    });

    it('still accepts the older tenantName and subdomain fields, lowercasing the handle', async () => {
      arrangeRegister();

      await service.register({
        email: validRegisterDto.email,
        password: validRegisterDto.password,
        tenantName: 'Globex',
        subdomain: 'Globex',
      });

      expect(organisations.assertHandleFree).toHaveBeenCalledWith('globex');
      const [[createArgs]] = prisma.user.create.mock.calls;
      expect(createArgs.data.organisation).toEqual({
        create: { name: 'Globex', handle: 'globex' },
      });
    });

    it('stores a hashed verification token for 24 h and emails the raw one', async () => {
      arrangeRegister();

      await service.register(validRegisterDto);

      const [[createArgs]] = prisma.user.create.mock.calls;
      const [[to, token, name]] = email.sendVerificationEmail.mock.calls as [
        [string, string, string],
      ];
      expect(to).toBe('admin@acme.com');
      expect(name).toBe('Jane Doe');
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(createArgs.data.verificationToken).toBe(hashToken(token));
      const expiry = createArgs.data.verificationExpiry as Date;
      expect(expiry.getTime() - Date.now()).toBeGreaterThan(
        VERIFICATION_TTL_MS - 5_000,
      );
    });

    it('still signs the company up when the verification email cannot be sent', async () => {
      arrangeRegister();
      email.sendVerificationEmail.mockResolvedValueOnce(false);

      const result = await service.register(validRegisterDto);

      expect(result.user.emailVerified).toBe(false);
      expect(result.accessToken).toBe('signed.jwt.token');
    });

    it('rejects duplicate email with ConflictException', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'existing' });

      await expect(service.register(validRegisterDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects a taken handle with ConflictException', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      organisations.assertHandleFree.mockRejectedValueOnce(
        new ConflictException('Handle already taken'),
      );

      await expect(service.register(validRegisterDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns tokens for valid credentials', async () => {
      const hashedPassword = await bcrypt.hash('CorrectHorse9!', 4);
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'admin@acme.com',
        name: 'Jane',
        role: 'ADMIN',
        organisationId: 'org-1',
        tenantId: 'tenant-1',
        password: hashedPassword,
      });
      prisma.user.update.mockResolvedValueOnce({});

      const result = await service.login({
        email: 'admin@acme.com',
        password: 'CorrectHorse9!',
      });

      expect(result.user).toMatchObject({
        id: 'user-1',
        organisationId: 'org-1',
        tenantId: 'tenant-1',
      });
      expect(result.accessToken).toBeDefined();
    });

    it('throws Unauthorized on unknown email (does not leak existence)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.login({ email: 'nobody@x.com', password: 'whatever' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws Unauthorized on bad password', async () => {
      const hashedPassword = await bcrypt.hash('the-real-password', 4);
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'admin@acme.com',
        name: 'Jane',
        role: 'ADMIN',
        tenantId: 'tenant-1',
        password: hashedPassword,
      });

      await expect(
        service.login({ email: 'admin@acme.com', password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws Unauthorized when the user has no password (OAuth-only account)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'admin@acme.com',
        password: null,
      });

      await expect(
        service.login({ email: 'admin@acme.com', password: 'whatever' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('verifyEmail', () => {
    const token = 'raw-signup-token';

    it('marks the email verified and clears the token (single use)', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({
        id: 'user-1',
        verificationExpiry: new Date(Date.now() + 60_000),
      });
      prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'user-1',
        email: 'admin@acme.com',
      });

      await expect(service.verifyEmail(token)).resolves.toEqual({
        id: 'user-1',
        email: 'admin@acme.com',
        emailVerified: true,
      });

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          verificationToken: hashToken(token),
          pendingEmail: null,
          deletedAt: null,
        },
        select: { id: true, verificationExpiry: true },
      });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', verificationToken: hashToken(token) },
        data: {
          emailVerified: true,
          verificationToken: null,
          verificationExpiry: null,
        },
      });
    });

    it('rejects an unknown or already used token', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(null);
      await expect(service.verifyEmail(token)).rejects.toThrow(
        new BadRequestException(
          'This verification link is invalid or has already been used.',
        ),
      );
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({
        id: 'user-1',
        verificationExpiry: new Date(Date.now() - 1),
      });
      await expect(service.verifyEmail(token)).rejects.toThrow(/expired/);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('resendVerification', () => {
    const unverified = {
      id: 'user-1',
      email: 'admin@acme.com',
      name: 'Jane',
      emailVerified: false,
      pendingEmail: null,
    };

    it('issues a fresh token and emails it', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(unverified);
      prisma.user.update.mockResolvedValueOnce({});

      await expect(service.resendVerification('user-1')).resolves.toEqual({
        message: 'Verification email sent to admin@acme.com.',
      });

      const [[{ data }]] = prisma.user.update.mock.calls;
      const [[, token]] = email.sendVerificationEmail.mock.calls as [
        [string, string],
      ];
      expect(data.verificationToken).toBe(hashToken(token));
    });

    it('is a no-op for a verified user', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        ...unverified,
        emailVerified: true,
      });
      await expect(service.resendVerification('user-1')).resolves.toEqual({
        message: 'Your email is already verified.',
      });
      expect(email.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('refuses while an email change is pending (same token slot)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        ...unverified,
        pendingEmail: 'new@acme.com',
      });
      await expect(service.resendVerification('user-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('answers 503 when the email cannot be sent', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(unverified);
      prisma.user.update.mockResolvedValueOnce({});
      email.sendVerificationEmail.mockResolvedValueOnce(false);
      await expect(service.resendVerification('user-1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('forgotPassword', () => {
    it('stores a hashed 1-hour token and emails the raw one', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'admin@acme.com',
      });
      prisma.user.update.mockResolvedValueOnce({});

      await expect(service.forgotPassword('admin@acme.com')).resolves.toEqual({
        message: FORGOT_PASSWORD_MESSAGE,
      });

      const [[{ where, data }]] = prisma.user.update.mock.calls;
      const [[to, token]] = email.sendPasswordResetEmail.mock.calls as [
        [string, string],
      ];
      expect(where).toEqual({ id: 'user-1' });
      expect(to).toBe('admin@acme.com');
      expect(data.resetToken).toBe(hashToken(token));
      expect(
        (data.resetTokenExpiry as Date).getTime() - Date.now(),
      ).toBeGreaterThan(PASSWORD_RESET_TTL_MS - 5_000);
    });

    it('answers the same for an unknown email and sends nothing', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.forgotPassword('nobody@x.com')).resolves.toEqual({
        message: FORGOT_PASSWORD_MESSAGE,
      });
      expect(email.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('clears the token when the email cannot be sent, still answering 200', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'admin@acme.com',
      });
      prisma.user.update.mockResolvedValueOnce({});
      email.sendPasswordResetEmail.mockResolvedValueOnce(false);

      await expect(service.forgotPassword('admin@acme.com')).resolves.toEqual({
        message: FORGOT_PASSWORD_MESSAGE,
      });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', resetToken: expect.any(String) as string },
        data: { resetToken: null, resetTokenExpiry: null },
      });
    });
  });

  describe('resetPassword', () => {
    const token = 'raw-reset-token';

    it('hashes the new password, burns the token, signs every session out and marks the email verified', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({
        id: 'user-1',
        resetTokenExpiry: new Date(Date.now() + 60_000),
      });

      await expect(
        service.resetPassword(token, 'NewHorse10!'),
      ).resolves.toEqual({
        message: 'Password updated. Sign in with your new password.',
      });

      const [[{ where, data }]] = prisma.user.updateMany.mock.calls;
      expect(where).toEqual({ id: 'user-1', resetToken: hashToken(token) });
      expect(data).toMatchObject({
        resetToken: null,
        resetTokenExpiry: null,
        refreshToken: null,
        emailVerified: true,
      });
      expect(data.password).not.toBe('NewHorse10!');
      await expect(
        bcrypt.compare('NewHorse10!', data.password as string),
      ).resolves.toBe(true);
    });

    it('rejects an unknown token', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.resetPassword(token, 'NewHorse10!'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({
        id: 'user-1',
        resetTokenExpiry: new Date(Date.now() - 1),
      });
      await expect(service.resetPassword(token, 'NewHorse10!')).rejects.toThrow(
        /expired/,
      );
    });

    it('rejects a token that was used between the read and the write', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({
        id: 'user-1',
        resetTokenExpiry: new Date(Date.now() + 60_000),
      });
      prisma.user.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(
        service.resetPassword(token, 'NewHorse10!'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('refreshTokens', () => {
    it('rotates and returns a new token pair when refresh token is valid', async () => {
      const refresh = 'incoming.refresh.token';
      const hashedStored = await bcrypt.hash(refresh, 4);

      jwt.verify.mockReturnValueOnce({ sub: 'user-1' });
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'a@b.c',
        name: null,
        role: 'ADMIN',
        tenantId: 't',
        refreshToken: hashedStored,
      });
      prisma.user.update.mockResolvedValueOnce({});

      const result = await service.refreshTokens(refresh);

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(jwt.signAsync).toHaveBeenCalledTimes(2);
    });

    it('throws Unauthorized when JWT verify fails', async () => {
      jwt.verify.mockImplementationOnce(() => {
        throw new Error('jwt expired');
      });

      await expect(service.refreshTokens('bad')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws Unauthorized when refresh token does not match stored hash', async () => {
      jwt.verify.mockReturnValueOnce({ sub: 'user-1' });
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        refreshToken: await bcrypt.hash('a-different-token', 4),
      });

      await expect(
        service.refreshTokens('mismatched.token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws Unauthorized when user has no stored refresh token (logged out)', async () => {
      jwt.verify.mockReturnValueOnce({ sub: 'user-1' });
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        refreshToken: null,
      });

      await expect(service.refreshTokens('any')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('clears the refresh token for the user', async () => {
      prisma.user.update.mockResolvedValueOnce({});

      await service.logout('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { refreshToken: null },
      });
    });
  });
});
