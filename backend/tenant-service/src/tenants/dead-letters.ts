import type { RabbitMQQueueConfig } from '@golevelup/nestjs-rabbitmq';
import type { Tenant } from '.prisma/tenant-client';
import type { DeprovisionPart } from '@liftoff/shared-types';

export type ProvisioningStep = keyof Pick<
  Tenant,
  | 'dbStatus'
  | 'dnsStatus'
  | 'credentialsStatus'
  | 'billingStatus'
  | 'notificationStatus'
>;

export const DEAD_LETTER_EXCHANGE = 'dlx.provisioning';

// Each worker's deadLetterRoutingKey, mapped to the step it owns.
export const STEP_BY_DEAD_LETTER_KEY: Record<string, ProvisioningStep> = {
  'db-provisioner.failed': 'dbStatus',
  'dns-provisioner.failed': 'dnsStatus',
  'credentials.failed': 'credentialsStatus',
  'billing.failed': 'billingStatus',
  'notification.failed': 'notificationStatus',
};

export const DEAD_LETTER_KEY_BY_STEP = Object.fromEntries(
  Object.entries(STEP_BY_DEAD_LETTER_KEY).map(([key, step]) => [step, key]),
) as Record<ProvisioningStep, string>;

// Set by tenant-service when it dead-letters a message itself (the live demo's failStep),
// where RabbitMQ adds no x-death.
export const DEAD_LETTER_REASON_HEADER = 'x-liftoff-reason';

export type TeardownStep = keyof Pick<
  Tenant,
  'teardownDbStatus' | 'teardownCredentialsStatus' | 'teardownBillingStatus'
>;

export const TEARDOWN_STEP_BY_PART: Record<DeprovisionPart, TeardownStep> = {
  db: 'teardownDbStatus',
  credentials: 'teardownCredentialsStatus',
  billing: 'teardownBillingStatus',
};

// The deadLetterRoutingKey of each worker's tenant.deprovision queue.
export const TEARDOWN_BY_DEAD_LETTER_KEY: Record<string, DeprovisionPart> = {
  'db-provisioner.deprovision.failed': 'db',
  'credentials.deprovision.failed': 'credentials',
  'billing.deprovision.failed': 'billing',
};

export const DEAD_LETTER_ROUTING_KEYS = [
  ...Object.keys(STEP_BY_DEAD_LETTER_KEY),
  ...Object.keys(TEARDOWN_BY_DEAD_LETTER_KEY),
];

// Parking lot for inspection and replay: nothing consumes it, and past the cap
// RabbitMQ drops the oldest message.
export const DEAD_LETTER_QUEUE: RabbitMQQueueConfig = {
  name: 'provisioning.dead-letters',
  exchange: DEAD_LETTER_EXCHANGE,
  routingKey: DEAD_LETTER_ROUTING_KEYS,
  options: { durable: true, maxLength: 10_000 },
};

// The parts of amqplib's ConsumeMessage a dead-letter handler reads.
export interface DeadLetterMessage {
  fields: { routingKey: string };
  properties: {
    headers?: {
      'x-death'?: { queue: string; reason: string; 'routing-keys': string[] }[];
      [DEAD_LETTER_REASON_HEADER]?: unknown;
    };
  };
}

// Workers nack without a reason, so x-death is all there is to report.
export function describeDeadLetter(message: DeadLetterMessage): string {
  const headers = message.properties.headers;
  const death = headers?.['x-death']?.[0];
  if (!death) {
    const reason = headers?.[DEAD_LETTER_REASON_HEADER];
    return typeof reason === 'string'
      ? reason
      : `Dead-lettered as ${message.fields.routingKey}`;
  }
  return `${death.queue} ${death.reason} ${death['routing-keys'].join(', ')}`;
}
