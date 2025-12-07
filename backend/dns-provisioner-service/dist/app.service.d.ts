import { AmqpConnection, Nack } from '@golevelup/nestjs-rabbitmq';
import * as sharedTypes from '@liftoff/shared-types';
export declare class AppService {
    private readonly amqpConnection;
    constructor(amqpConnection: AmqpConnection);
    handleTenantDbReady(payload: sharedTypes.TenantDbReadyPayload): Promise<Nack | undefined>;
}
