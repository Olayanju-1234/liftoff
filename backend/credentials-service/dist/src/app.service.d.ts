import { AmqpConnection, Nack } from '@golevelup/nestjs-rabbitmq';
import { PrismaService } from './prisma.service';
import type { TenantDnsReadyPayload } from '@liftoff/shared-types';
export declare class AppService {
    private readonly prisma;
    private readonly amqpConnection;
    private readonly logger;
    constructor(prisma: PrismaService, amqpConnection: AmqpConnection);
    handleTenantDnsReady(payload: TenantDnsReadyPayload): Promise<Nack | undefined>;
}
