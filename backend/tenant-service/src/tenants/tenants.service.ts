import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { AmqpConnection, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { StepStatus, TenantStatus } from '@prisma/client';
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
        // Get or create plan - check by both id and name to avoid unique constraint issues
        let plan = await this.prisma.plan.findFirst({
            where: {
                OR: [
                    { id: createTenantDto.planId },
                    { name: createTenantDto.planId }
                ]
            }
        });

        if (!plan) {
            plan = await this.prisma.plan.create({
                data: {
                    id: createTenantDto.planId,
                    name: createTenantDto.planId,
                    maxUsers: 5,
                    maxApiKeys: 3,
                },
            });
        }


        try {
            const tenant = await this.prisma.tenant.create({
                data: {
                    name: createTenantDto.name,
                    subdomain: createTenantDto.subdomain,
                    planId: plan.id,
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
        queueOptions: {
            durable: true,
        },
    })
    public async handleDbReady(payload: TenantDbReadyPayload) {
        console.log(`[HANDLER] handleDbReady received:`, payload);
        try {
            await this.prisma.tenant.update({
                where: { id: payload.tenantId },
                data: {
                    dbStatus: StepStatus.SUCCESS,
                    dnsStatus: StepStatus.IN_PROGRESS
                },
            });
            await this.logEvent(payload.tenantId, 'tenant.db.ready', 'Success', payload);
            console.log(`[HANDLER] handleDbReady completed for tenant:`, payload.tenantId);
        } catch (error) {
            console.error(`[HANDLER] handleDbReady failed:`, error);
            throw error;
        }
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

    async cancel(id: string, reason?: string) {
        const tenant = await this.prisma.tenant.findUnique({ where: { id } });

        if (!tenant) {
            throw new Error(`Tenant ${id} not found`);
        }

        if (tenant.status !== TenantStatus.PROVISIONING) {
            throw new Error(`Cannot cancel tenant with status ${tenant.status}`);
        }

        const cancelReason = reason || 'Cancelled by user';

        // Update tenant status and all pending/in-progress steps to CANCELLED
        const updatedTenant = await this.prisma.tenant.update({
            where: { id },
            data: {
                status: TenantStatus.CANCELLED,
                cancelledAt: new Date(),
                cancelReason,
                dbStatus: tenant.dbStatus === StepStatus.PENDING || tenant.dbStatus === StepStatus.IN_PROGRESS ? StepStatus.CANCELLED : tenant.dbStatus,
                dnsStatus: tenant.dnsStatus === StepStatus.PENDING || tenant.dnsStatus === StepStatus.IN_PROGRESS ? StepStatus.CANCELLED : tenant.dnsStatus,
                credentialsStatus: tenant.credentialsStatus === StepStatus.PENDING || tenant.credentialsStatus === StepStatus.IN_PROGRESS ? StepStatus.CANCELLED : tenant.credentialsStatus,
                billingStatus: tenant.billingStatus === StepStatus.PENDING || tenant.billingStatus === StepStatus.IN_PROGRESS ? StepStatus.CANCELLED : tenant.billingStatus,
                notificationStatus: tenant.notificationStatus === StepStatus.PENDING || tenant.notificationStatus === StepStatus.IN_PROGRESS ? StepStatus.CANCELLED : tenant.notificationStatus,
            },
            include: { plan: true },
        });

        await this.logEvent(id, 'tenant.cancelled', 'Success', { reason: cancelReason });

        // Publish cancellation event for other services to potentially clean up resources
        await this.amqpConnection.publish(
            'provisioning.direct',
            'tenant.cancelled',
            { tenantId: id, subdomain: tenant.subdomain, reason: cancelReason },
        );

        console.log(`Tenant ${id} cancelled: ${cancelReason}`);
        return updatedTenant;
    }

    async delete(id: string) {
        const tenant = await this.prisma.tenant.findUnique({ where: { id } });

        if (!tenant) {
            throw new Error(`Tenant ${id} not found`);
        }

        // Publish deletion event for other services to clean up resources (schemas, DNS, credentials, etc.)
        await this.amqpConnection.publish(
            'provisioning.direct',
            'tenant.deleted',
            { tenantId: id, subdomain: tenant.subdomain },
        );

        await this.logEvent(id, 'tenant.deleted', 'Success', { subdomain: tenant.subdomain });

        // Events are cascade deleted due to Prisma schema onDelete: Cascade
        const deletedTenant = await this.prisma.tenant.delete({
            where: { id }
        });

        console.log(`Tenant ${id} (${tenant.subdomain}) deleted`);
        return deletedTenant;
    }
}
