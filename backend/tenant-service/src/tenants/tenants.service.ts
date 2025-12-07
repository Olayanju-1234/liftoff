import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { AmqpConnection, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { StepStatus } from '@prisma/client';
import type {
    ProvisioningCompletePayload,
    TenantRequestedPayload,
    TenantDbReadyPayload,
    TenantDnsReadyPayload,
    TenantCredentialsReadyPayload,
    TenantBillingActivePayload,
} from '@liftoff/shared-types';

@Injectable()
export class TenantsService {
    constructor(
        private prisma: PrismaService,
        private readonly amqpConnection: AmqpConnection,
    ) { }

    async create(createTenantDto: CreateTenantDto) {
        await this.prisma.plan.upsert({
            where: { id: createTenantDto.planId },
            update: {},
            create: {
                id: createTenantDto.planId,
                name: createTenantDto.planId,
                maxUsers: 5,
                maxApiKeys: 3,
            },
        });

        try {
            const tenant = await this.prisma.tenant.create({
                data: {
                    name: createTenantDto.name,
                    subdomain: createTenantDto.subdomain,
                    planId: createTenantDto.planId,
                    dbStatus: StepStatus.IN_PROGRESS, // Start first step
                },
            });

            await this.logEvent(tenant.id, 'tenant.created', 'Success', { name: tenant.name, plan: tenant.planId });

            const eventPayload: TenantRequestedPayload = {
                tenantId: tenant.id,
                subdomain: tenant.subdomain,
                planId: tenant.planId,
            };

            await this.amqpConnection.publish(
                'provisioning.direct',
                'tenant.requested',
                eventPayload,
            );

            return tenant;
        } catch (error) {
            if (
                error instanceof PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                const target = (error.meta?.target as string[])?.[0];
                throw new ConflictException(
                    `A tenant with this ${target} already exists.`,
                );
            }
            throw error;
        }
    }

    private async logEvent(tenantId: string, eventType: string, status: string, payload: any) {
        try {
            await this.prisma.eventLog.create({
                data: {
                    tenantId,
                    eventType,
                    status,
                    payload,
                },
            });
        } catch (e) {
            console.error('Failed to log event:', e);
        }
    }

    @RabbitSubscribe({
        exchange: 'provisioning.direct',
        routingKey: 'tenant.db.ready',
        queue: 'tenant-service-db-ready-queue',
    })
    public async handleDbReady(payload: TenantDbReadyPayload) {
        await this.prisma.tenant.update({
            where: { id: payload.tenantId },
            data: {
                dbStatus: StepStatus.SUCCESS,
                dnsStatus: StepStatus.IN_PROGRESS
            },
        });
        await this.logEvent(payload.tenantId, 'tenant.db.ready', 'Success', payload);
    }

    @RabbitSubscribe({
        exchange: 'provisioning.direct',
        routingKey: 'tenant.dns.ready',
        queue: 'tenant-service-dns-ready-queue',
    })
    public async handleDnsReady(payload: TenantDnsReadyPayload) {
        await this.prisma.tenant.update({
            where: { id: payload.tenantId },
            data: {
                dnsStatus: StepStatus.SUCCESS,
                credentialsStatus: StepStatus.IN_PROGRESS
            },
        });
        await this.logEvent(payload.tenantId, 'tenant.dns.ready', 'Success', payload);
    }

    @RabbitSubscribe({
        exchange: 'provisioning.direct',
        routingKey: 'tenant.credentials.ready',
        queue: 'tenant-service-credentials-ready-queue',
    })
    public async handleCredentialsReady(payload: TenantCredentialsReadyPayload) {
        await this.prisma.tenant.update({
            where: { id: payload.tenantId },
            data: {
                credentialsStatus: StepStatus.SUCCESS,
                billingStatus: StepStatus.IN_PROGRESS
            },
        });
        await this.logEvent(payload.tenantId, 'tenant.credentials.ready', 'Success', payload);
    }

    @RabbitSubscribe({
        exchange: 'provisioning.direct',
        routingKey: 'tenant.billing.active',
        queue: 'tenant-service-billing-active-queue',
    })
    public async handleBillingActive(payload: TenantBillingActivePayload) {
        await this.prisma.tenant.update({
            where: { id: payload.tenantId },
            data: {
                billingStatus: StepStatus.SUCCESS,
                notificationStatus: StepStatus.IN_PROGRESS
            },
        });
        await this.logEvent(payload.tenantId, 'tenant.billing.active', 'Success', payload);
    }

    @RabbitSubscribe({
        exchange: 'provisioning.direct',
        routingKey: 'tenant.provisioning.complete',
        queue: 'tenant-service-completion-queue',
        queueOptions: {
            durable: true,
        },
    })
    public async handleProvisioningComplete(
        payload: ProvisioningCompletePayload,
    ) {
        console.log(
            `RECEIVED FINAL EVENT: Activating tenant ${payload.tenantId}`,
        );

        try {
            await this.prisma.tenant.update({
                where: {
                    id: payload.tenantId,
                },
                data: {
                    status: 'ACTIVE',
                    notificationStatus: StepStatus.SUCCESS
                },
            });

            await this.logEvent(payload.tenantId, 'tenant.provisioning.complete', 'Success', payload);
            console.log(`SUCCESS: Tenant ${payload.tenantId} is now ACTIVE.`);
        } catch (error) {
            console.error(
                `FAILED to activate tenant ${payload.tenantId}:`,
                error.message,
            );
            await this.logEvent(payload.tenantId, 'tenant.provisioning.complete', 'Error', { error: error.message });
        }
    }

    async findAll() {
        return this.prisma.tenant.findMany({
            include: { plan: true }
        });
    }

    async findOne(id: string) {
        return this.prisma.tenant.findUnique({
            where: { id },
            include: { plan: true, events: { orderBy: { timestamp: 'desc' } } }
        });
    }

    async findEvents(id: string) {
        return this.prisma.eventLog.findMany({
            where: { tenantId: id },
            orderBy: { timestamp: 'desc' }
        });
    }

    async findAllEvents() {
        return this.prisma.eventLog.findMany({
            include: { tenant: true },
            orderBy: { timestamp: 'desc' }
        });
    }

    async delete(id: string) {
        // Events are cascade deleted due to Prisma schema onDelete: Cascade
        return this.prisma.tenant.delete({
            where: { id }
        });
    }
}
