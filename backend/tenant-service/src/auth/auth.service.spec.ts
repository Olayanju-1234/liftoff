import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Prisma } from '.prisma/tenant-client';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { PrismaService } from '../prisma.service';
import { OrganisationsService } from '../organisations/organisations.service';

type MockPrisma = {
  user: {
    findUnique: jest.Mock;
    create: jest.Mock<Promise<unknown>, [Prisma.UserCreateArgs]>;
    update: jest.Mock<Promise<unknown>, [Prisma.UserUpdateArgs]>;
  };
  tenant: { findUnique: jest.Mock; create: jest.Mock };
  plan: { upsert: jest.Mock };
  $transaction: jest.Mock;
};

const buildPrisma = (): MockPrisma => ({
  user: {
    findUnique: jest.fn(),
    create: jest.fn<Promise<unknown>, [Prisma.UserCreateArgs]>(),
    update: jest.fn<Promise<unknown>, [Prisma.UserUpdateArgs]>(),
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

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: OrganisationsService, useValue: organisations },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('register', () => {
    const createdUser = {
      id: 'user-1',
      email: validRegisterDto.email,
      name: validRegisterDto.name,
      role: 'ADMIN',
      organisationId: 'org-1',
      tenantId: null,
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
