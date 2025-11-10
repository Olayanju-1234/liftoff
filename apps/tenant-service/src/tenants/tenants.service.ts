// apps/tenant-service/src/tenants/tenants.service.ts

import { Injectable, ConflictException } from '@nestjs/common'; // 1. Import ConflictException
import { PrismaService } from '../prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Prisma } from '@prisma/client'; // 2. Import Prisma types

@Injectable()
export class TenantsService {
    constructor(
        private prisma: PrismaService,
        private readonly amqpConnection: AmqpConnection,
    ) { }

    async create(createTenantDto: CreateTenantDto) {
        // This test code for the Plan can stay for now
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

        // 3. --- ADD THE TRY/CATCH BLOCK ---
        try {
            const tenant = await this.prisma.tenant.create({
                data: {
                    name: createTenantDto.name,
                    subdomain: createTenantDto.subdomain,
                    planId: createTenantDto.planId,
                },
            });

            // If create is successful, publish the event
            const eventPayload = {
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
            // 4. --- INSPECT THE ERROR ---
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                // We know this is a unique constraint violation
                // The 'target' tells us which field failed.
                const target = (error.meta?.target as string[])?.[0];
                throw new ConflictException(`A tenant with this ${target} already exists.`);
            }

            // If it's some other error, just throw it
            throw error;
        }
    }
}