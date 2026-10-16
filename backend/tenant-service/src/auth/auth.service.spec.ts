import {
  ConflictException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { StepStatus, type Prisma } from '.prisma/tenant-client';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { PrismaService } from '../prisma.service';
import { TenantsService } from '../tenants/tenants.service';

type MockPrisma = {
  user: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock<Promise<unknown>, [Prisma.UserUpdateArgs]>;
  };
  tenant: { findUnique: jest.Mock; create: jest.Mock };
  plan: { upsert: jest.Mock<Promise<unknown>, [Prisma.PlanUpsertArgs]> };
  $transaction: jest.Mock;
};

const buildPrisma = (): MockPrisma => ({
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn<Promise<unknown>, [Prisma.UserUpdateArgs]>(),
  },
  tenant: { findUnique: jest.fn(), create: jest.fn() },
  plan: { upsert: jest.fn<Promise<unknown>, [Prisma.PlanUpsertArgs]>() },
  $transaction: jest.fn(),
});

describe('AuthService', () => {
  let service: AuthService;
  let prisma: MockPrisma;
  let jwt: { signAsync: jest.Mock; verify: jest.Mock };
  let config: { getOrThrow: jest.Mock; get: jest.Mock };
  let tenants: { startProvisioning: jest.Mock };

  const validRegisterDto = {
    email: 'admin@acme.com',
    password: 'CorrectHorse9!',
    name: 'Jane Doe',
    tenantName: 'Acme Corp',
    subdomain: 'acme',
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
    tenants = {
      startProvisioning: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: TenantsService, useValue: tenants },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('register', () => {
    const workspace = {
      id: 'tenant-1',
      name: 'Acme Corp',
      subdomain: 'acme',
      planId: 'starter',
    };
    let tenantCreate: jest.Mock<Promise<unknown>, [Prisma.TenantCreateArgs]>;
    let tenantUpdate: jest.Mock<Promise<unknown>, [Prisma.TenantUpdateArgs]>;

    const arrangeRegister = () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      prisma.tenant.findUnique.mockResolvedValueOnce(null);
      prisma.plan.upsert.mockResolvedValueOnce({ id: 'starter' });
      tenantCreate = jest
        .fn<Promise<unknown>, [Prisma.TenantCreateArgs]>()
        .mockResolvedValueOnce(workspace);
      tenantUpdate = jest
        .fn<Promise<unknown>, [Prisma.TenantUpdateArgs]>()
        .mockResolvedValueOnce({ ...workspace, ownerId: 'user-1' });
      prisma.$transaction.mockImplementationOnce(
        (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            tenant: { create: tenantCreate, update: tenantUpdate },
            user: {
              create: jest.fn().mockResolvedValueOnce({
                id: 'user-1',
                email: validRegisterDto.email,
                name: validRegisterDto.name,
                role: 'ADMIN',
                tenantId: 'tenant-1',
              }),
            },
          }),
      );
      prisma.user.update.mockResolvedValueOnce({});
    };

    it('hashes the password, creates tenant + user atomically, and returns tokens', async () => {
      arrangeRegister();

      const result = await service.register(validRegisterDto);

      expect(result.user).toMatchObject({
        id: 'user-1',
        email: 'admin@acme.com',
        role: 'ADMIN',
        tenantId: 'tenant-1',
      });
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toBe('signed.jwt.token');
      expect(jwt.signAsync).toHaveBeenCalledTimes(2);
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      const [[updateArgs]] = prisma.user.update.mock.calls;
      expect(updateArgs.where).toEqual({ id: 'user-1' });
      // Refresh token must be stored hashed, never in plaintext.
      const storedRefreshToken = updateArgs.data.refreshToken;
      expect(typeof storedRefreshToken).toBe('string');
      expect(storedRefreshToken).not.toEqual('signed.jwt.token');
    });

    it('puts the workspace on the starter plan, which billing can price', async () => {
      arrangeRegister();

      await service.register(validRegisterDto);

      const [[upsertArgs]] = prisma.plan.upsert.mock.calls;
      expect(upsertArgs.where).toEqual({ id: 'starter' });
      expect(upsertArgs.create).toMatchObject({ id: 'starter' });
      const [[createArgs]] = tenantCreate.mock.calls;
      expect(createArgs.data.planId).toBe('starter');
    });

    it('makes the new user the owner of the workspace tenant', async () => {
      arrangeRegister();

      await service.register(validRegisterDto);

      expect(tenantUpdate).toHaveBeenCalledWith({
        where: { id: 'tenant-1' },
        data: { ownerId: 'user-1' },
      });
    });

    it('starts the provisioning saga for the workspace tenant', async () => {
      arrangeRegister();

      await service.register(validRegisterDto);

      const [[createArgs]] = tenantCreate.mock.calls;
      expect(createArgs.data.dbStatus).toBe(StepStatus.IN_PROGRESS);
      expect(tenants.startProvisioning).toHaveBeenCalledWith(workspace);
    });

    it('still returns tokens when the workspace saga cannot start', async () => {
      const logError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      arrangeRegister();
      tenants.startProvisioning.mockRejectedValueOnce(new Error('timeout'));

      await expect(service.register(validRegisterDto)).resolves.toMatchObject({
        accessToken: 'signed.jwt.token',
        user: { tenantId: 'tenant-1' },
      });
      expect(logError).toHaveBeenCalledWith(
        'Could not start provisioning workspace tenant-1: timeout',
      );
      logError.mockRestore();
    });

    it('rejects duplicate email with ConflictException', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'existing' });

      await expect(service.register(validRegisterDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tenants.startProvisioning).not.toHaveBeenCalled();
    });

    it('rejects duplicate subdomain with ConflictException', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      prisma.tenant.findUnique.mockResolvedValueOnce({ id: 'existing' });

      await expect(service.register(validRegisterDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
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
        tenantId: 'tenant-1',
        password: hashedPassword,
      });
      prisma.user.update.mockResolvedValueOnce({});

      const result = await service.login({
        email: 'admin@acme.com',
        password: 'CorrectHorse9!',
      });

      expect(result.user.id).toBe('user-1');
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
