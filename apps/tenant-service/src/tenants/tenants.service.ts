import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { AmqpConnection, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import type {
    ProvisioningCompletePayload,
    TenantRequestedPayload,
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
                },
            });

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
                },
            });

            console.log(`SUCCESS: Tenant ${payload.tenantId} is now ACTIVE.`);
        } catch (error) {
            console.error(
                `FAILED to activate tenant ${payload.tenantId}:`,
                error.message,
            );
        }
    }
}