import { AmqpConnection, Nack } from '@golevelup/nestjs-rabbitmq';
import { PrismaService } from './prisma.service';
import type { TenantRequestedPayload } from '@liftoff/shared-types';
export declare class AppService {
    private readonly prisma;
    private readonly amqpConnection;
    private readonly logger;
    constructor(prisma: PrismaService, amqpConnection: AmqpConnection);
    handleTenantRequested(payload: TenantRequestedPayload): Promise<Nack | undefined>;
}
