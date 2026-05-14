import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { StepStatus, TenantStatus } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

import { TenantsService } from './tenants.service';
import { PrismaService } from '../prisma.service';

type MockPrisma = {
    plan: { findFirst: jest.Mock; create: jest.Mock };
    tenant: {
        create: jest.Mock;
        findUnique: jest.Mock;
        findMany: jest.Mock;
        update: jest.Mock;
        delete: jest.Mock;
    };
    eventLog: { create: jest.Mock; findMany: jest.Mock };
};

const buildPrisma = (): MockPrisma => ({
    plan: { findFirst: jest.fn(), create: jest.fn() },
    tenant: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
    eventLog: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn() },
});

describe('TenantsService', () => {
    let service: TenantsService;
    let prisma: MockPrisma;
    let amqp: { publish: jest.Mock };

    const baseDto = { name: 'Acme', subdomain: 'acme', planId: 'starter' };

    beforeEach(async () => {
        prisma = buildPrisma();
        amqp = { publish: jest.fn().mockResolvedValue(undefined) };

        const moduleRef = await Test.createTestingModule({
            providers: [
                TenantsService,
                { provide: PrismaService, useValue: prisma },
                { provide: AmqpConnection, useValue: amqp },
            ],
        }).compile();

        service = moduleRef.get(TenantsService);
    });

    describe('create', () => {
        it('reuses existing plan and publishes tenant.requested', async () => {
            prisma.plan.findFirst.mockResolvedValueOnce({ id: 'starter' });
            prisma.tenant.create.mockResolvedValueOnce({
                id: 'tenant-1',
                subdomain: 'acme',
                planId: 'starter',
            });

            const result = await service.create(baseDto);

            expect(prisma.plan.create).not.toHaveBeenCalled();
            expect(prisma.tenant.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    dbStatus: StepStatus.IN_PROGRESS,
                }),
            });
            expect(amqp.publish).toHaveBeenCalledWith(
                'provisioning.direct',
                'tenant.requested',
                {
                    tenantId: 'tenant-1',
                    subdomain: 'acme',
                    planId: 'starter',
                },
            );
            expect(result.id).toBe('tenant-1');
        });

        it('creates plan on the fly when missing', async () => {
            prisma.plan.findFirst.mockResolvedValueOnce(null);
            prisma.plan.create.mockResolvedValueOnce({ id: 'starter' });
            prisma.tenant.create.mockResolvedValueOnce({
                id: 'tenant-2',
                subdomain: 'acme',
                planId: 'starter',
            });

            await service.create(baseDto);

            expect(prisma.plan.create).toHaveBeenCalled();
        });

        it('translates Prisma P2002 unique violation into ConflictException', async () => {
            prisma.plan.findFirst.mockResolvedValueOnce({ id: 'starter' });
            const p2002 = new PrismaClientKnownRequestError(
                'Unique constraint failed',
                {
                    code: 'P2002',
                    clientVersion: 'test',
                    meta: { target: ['subdomain'] },
                } as any,
            );
            prisma.tenant.create.mockRejectedValueOnce(p2002);

            await expect(service.create(baseDto)).rejects.toBeInstanceOf(
                ConflictException,
            );
            expect(amqp.publish).not.toHaveBeenCalled();
        });
    });

    describe('saga handlers', () => {
        it('handleDbReady advances state from db→dns', async () => {
            prisma.tenant.update.mockResolvedValueOnce({});

            await service.handleDbReady({
                tenantId: 't',
                subdomain: 's',
                planId: 'p',
            });

            expect(prisma.tenant.update).toHaveBeenCalledWith({
                where: { id: 't' },
                data: {
                    dbStatus: StepStatus.SUCCESS,
                    dnsStatus: StepStatus.IN_PROGRESS,
                },
            });
        });

        it('handleProvisioningComplete sets ACTIVE via the enum (not a string literal)', async () => {
            prisma.tenant.update.mockResolvedValueOnce({});

            await service.handleProvisioningComplete({
                tenantId: 't',
                subdomain: 's',
            });

            const updateCall = prisma.tenant.update.mock.calls[0][0];
            expect(updateCall.data.status).toBe(TenantStatus.ACTIVE);
            expect(updateCall.data.notificationStatus).toBe(StepStatus.SUCCESS);
        });
    });

    describe('cancel', () => {
        const provisioningTenant = {
            id: 't',
            subdomain: 'acme',
            status: TenantStatus.PROVISIONING,
            dbStatus: StepStatus.SUCCESS,
            dnsStatus: StepStatus.IN_PROGRESS,
            credentialsStatus: StepStatus.PENDING,
            billingStatus: StepStatus.PENDING,
            notificationStatus: StepStatus.PENDING,
        };

        it('cancels in-progress + pending steps and publishes tenant.cancelled', async () => {
            prisma.tenant.findUnique.mockResolvedValueOnce(provisioningTenant);
            prisma.tenant.update.mockResolvedValueOnce({
                ...provisioningTenant,
                status: TenantStatus.CANCELLED,
            });

            await service.cancel('t', 'user changed mind');

            const update = prisma.tenant.update.mock.calls[0][0].data;
            expect(update.status).toBe(TenantStatus.CANCELLED);
            // Already-SUCCESS steps stay SUCCESS, others go CANCELLED.
            expect(update.dbStatus).toBe(StepStatus.SUCCESS);
            expect(update.dnsStatus).toBe(StepStatus.CANCELLED);
            expect(update.credentialsStatus).toBe(StepStatus.CANCELLED);
            expect(update.billingStatus).toBe(StepStatus.CANCELLED);
            expect(update.notificationStatus).toBe(StepStatus.CANCELLED);
            expect(amqp.publish).toHaveBeenCalledWith(
                'provisioning.direct',
                'tenant.cancelled',
                expect.objectContaining({ tenantId: 't', reason: 'user changed mind' }),
            );
        });

        it('throws NotFoundException when tenant is missing', async () => {
            prisma.tenant.findUnique.mockResolvedValueOnce(null);

            await expect(service.cancel('missing')).rejects.toBeInstanceOf(
                NotFoundException,
            );
        });

        it('throws BadRequestException when tenant is not in PROVISIONING state', async () => {
            prisma.tenant.findUnique.mockResolvedValueOnce({
                ...provisioningTenant,
                status: TenantStatus.ACTIVE,
            });

            await expect(service.cancel('t')).rejects.toBeInstanceOf(
                BadRequestException,
            );
            expect(prisma.tenant.update).not.toHaveBeenCalled();
        });
    });

    describe('delete', () => {
        it('emits tenant.deleted before removing the row (so consumers can clean up)', async () => {
            prisma.tenant.findUnique.mockResolvedValueOnce({
                id: 't',
                subdomain: 'acme',
            });
            prisma.tenant.delete.mockResolvedValueOnce({ id: 't' });

            await service.delete('t');

            // Order matters: publish must precede delete.
            const publishOrder = amqp.publish.mock.invocationCallOrder[0];
            const deleteOrder = prisma.tenant.delete.mock.invocationCallOrder[0];
            expect(publishOrder).toBeLessThan(deleteOrder);
        });

        it('throws NotFoundException when tenant is missing', async () => {
            prisma.tenant.findUnique.mockResolvedValueOnce(null);

            await expect(service.delete('nope')).rejects.toBeInstanceOf(
                NotFoundException,
            );
            expect(amqp.publish).not.toHaveBeenCalled();
            expect(prisma.tenant.delete).not.toHaveBeenCalled();
        });
    });

    describe('findOne', () => {
        it('throws NotFoundException when the tenant does not exist', async () => {
            prisma.tenant.findUnique.mockResolvedValueOnce(null);

            await expect(service.findOne('missing')).rejects.toBeInstanceOf(
                NotFoundException,
            );
        });
    });
});
