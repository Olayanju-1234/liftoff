import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { errorMessage } from '../common/error-message';
import { STEP_INPUT } from './retry';

const EXCHANGE = 'provisioning.direct';

// The parts of an amqplib connection this needs.
interface BrokerChannel {
  on(event: 'error', listener: () => void): unknown;
  unbindQueue(queue: string, source: string, pattern: string): Promise<unknown>;
  close(): Promise<void>;
}
export interface BrokerConnection {
  createChannel(): Promise<BrokerChannel>;
}

// Each worker used to listen for the previous worker's result (db-provisioner-queue was
// bound to tenant.requested, dns-provisioner-queue to tenant.db.ready, …). tenant-service
// now sends every step its input itself, so a binding left behind would run a builtin
// step twice, or run one the company made custom. Removed on every connect.
export const LEGACY_STEP_BINDINGS = Object.values(STEP_INPUT).map(
  ({ queue, routingKey }) => ({ queue, routingKey }),
);

@Injectable()
export class StepBindingsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StepBindingsService.name);

  constructor(private readonly amqp: AmqpConnection) {}

  onApplicationBootstrap(): void {
    this.amqp.managedConnection.on('connect', ({ connection }) => {
      void this.removeLegacyBindings(connection as BrokerConnection);
    });
    if (this.amqp.connected) {
      void this.removeLegacyBindings(this.amqp.connection as BrokerConnection);
    }
  }

  // Unbinding is a no-op on RabbitMQ when the binding is gone; a queue that does not exist
  // yet (a worker never started) is a channel error, so each one gets its own channel.
  async removeLegacyBindings(connection: BrokerConnection): Promise<number> {
    let removed = 0;
    for (const { queue, routingKey } of LEGACY_STEP_BINDINGS) {
      try {
        const channel = await connection.createChannel();
        channel.on('error', () => undefined);
        try {
          await channel.unbindQueue(queue, EXCHANGE, routingKey);
          removed++;
        } finally {
          await channel.close().catch(() => undefined);
        }
      } catch (error) {
        this.logger.warn(
          `Could not remove the ${routingKey} binding from ${queue}: ${errorMessage(error)}`,
        );
      }
    }
    this.logger.log(
      `Workers get their input from tenant-service only: ${removed}/${LEGACY_STEP_BINDINGS.length} legacy step bindings cleared`,
    );
    return removed;
  }
}
