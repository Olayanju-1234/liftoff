import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { PrismaService } from '../prisma.service';

type MockPrisma = {
    user: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    tenant: { findUnique: jest.Mock; create: jest.Mock };
    plan: { findFirst: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
};

const buildPrisma = (): MockPrisma => ({
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    tenant: { findUnique: jest.fn(), create: jest.fn() },
    plan: { findFirst: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
});

describe('AuthService', () => {
    let service: AuthService;
    let prisma: MockPrisma;
    let jwt: { signAsync: jest.Mock; verify: jest.Mock };
    let config: { getOrThrow: jest.Mock; get: jest.Mock };

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

        const moduleRef = await Test.createTestingModule({
            providers: [
                AuthService,
                { provide: PrismaService, useValue: prisma },
                { provide: JwtService, useValue: jwt },
                { provide: ConfigService, useValue: config },
            ],
        }).compile();

        service = moduleRef.get(AuthService);
    });

    describe('register', () => {
        it('hashes the password, creates tenant + user atomically, and returns tokens', async () => {
            prisma.user.findUnique.mockResolvedValueOnce(null);
            prisma.tenant.findUnique.mockResolvedValueOnce(null);
            prisma.plan.findFirst.mockResolvedValueOnce({ id: 'plan-1' });
            prisma.$transaction.mockImplementationOnce(async (fn: any) =>
                fn({
                    tenant: {
                        create: jest
                            .fn()
                            .mockResolvedValueOnce({ id: 'tenant-1', subdomain: 'acme' }),
                    },
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
            expect(prisma.user.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'user-1' },
                    data: expect.objectContaining({
                        refreshToken: expect.any(String),
                    }),
                }),
            );
            // Refresh token must be stored hashed, never in plaintext.
            const storedRefreshToken = prisma.user.update.mock.calls[0][0].data.refreshToken;
            expect(storedRefreshToken).not.toEqual('signed.jwt.token');
        });

        it('rejects duplicate email with ConflictException', async () => {
            prisma.user.findUnique.mockResolvedValueOnce({ id: 'existing' });

            await expect(service.register(validRegisterDto)).rejects.toBeInstanceOf(
                ConflictException,
            );
            expect(prisma.$transaction).not.toHaveBeenCalled();
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
