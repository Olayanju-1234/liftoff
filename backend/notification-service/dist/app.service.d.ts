import { AmqpConnection, Nack } from '@golevelup/nestjs-rabbitmq';
import * as sharedTypes from '@liftoff/shared-types';
export declare class AppService {
    private readonly amqpConnection;
    constructor(amqpConnection: AmqpConnection);
    handleTenantBillingActive(payload: sharedTypes.TenantBillingActivePayload): Promise<Nack | undefined>;
}
