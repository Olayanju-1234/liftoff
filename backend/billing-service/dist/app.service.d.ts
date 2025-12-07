import { AmqpConnection, Nack } from '@golevelup/nestjs-rabbitmq';
import * as sharedTypes from '@liftoff/shared-types';
export declare class AppService {
    private readonly amqpConnection;
    constructor(amqpConnection: AmqpConnection);
    handleTenantCredentialsReady(payload: sharedTypes.TenantCredentialsReadyPayload): Promise<Nack | undefined>;
}
