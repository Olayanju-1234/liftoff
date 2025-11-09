// apps/tenant-service/src/tenants/tenants.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq'; // <-- 1. Import

@Injectable()
export class TenantsService {
    // 2. Inject AmqpConnection
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

        const tenant = await this.prisma.tenant.create({
            data: {
                name: createTenantDto.name,
                subdomain: createTenantDto.subdomain,
                planId: createTenantDto.planId,
            },
        });

        // 3. --- NEW ---
        // After saving to DB, publish the event
        const eventPayload = {
            tenantId: tenant.id,
            subdomain: tenant.subdomain,
            planId: tenant.planId,
        };

        // Publish to our exchange with a "routing key"
        // Any service listening for this key will get the message.
        await this.amqpConnection.publish(
            'provisioning.direct', // Exchange
            'tenant.requested',    // Routing Key
            eventPayload,          // Payload
        );

        return tenant;
    }
}