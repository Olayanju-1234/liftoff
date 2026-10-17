import { StepStatus, type Prisma, type Tenant } from '.prisma/tenant-client';
import type {
  TenantBillingActivePayload,
  TenantDbReadyPayload,
  TenantRequestedPayload,
} from '@liftoff/shared-types';
import type { ProvisioningStep } from './dead-letters';

export interface StepInput {
  // The worker queue a retry is published to, through the default exchange, so only the
  // failed worker sees it again (tenant-service's own handlers do not).
  queue: string;
  // What the message was originally published as.
  routingKey: string;
  // Event-log types holding that message's payload, newest wins.
  events: string[];
}

export const STEP_INPUT: Record<ProvisioningStep, StepInput> = {
  dbStatus: {
    queue: 'db-provisioner-queue',
    routingKey: 'tenant.requested',
    events: [],
  },
  dnsStatus: {
    queue: 'dns-provisioner-queue',
    routingKey: 'tenant.db.ready',
    events: ['tenant.db.ready'],
  },
  credentialsStatus: {
    queue: 'credentials-queue',
    routingKey: 'tenant.dns.ready',
    events: ['tenant.dns.ready'],
  },
  billingStatus: {
    queue: 'billing-queue',
    routingKey: 'tenant.credentials.ready',
    events: ['tenant.credentials.ready'],
  },
  notificationStatus: {
    queue: 'notification-queue',
    routingKey: 'tenant.billing.active',
    events: ['tenant.billing.active', 'tenant.billing.skipped'],
  },
};

type RetryTenant = Pick<
  Tenant,
  | 'id'
  | 'subdomain'
  | 'planId'
  | 'schemaName'
  | 'isTest'
  | 'billingStatus'
  | 'stripeCustomerId'
  | 'stripeSubscriptionId'
>;

// The step's input rebuilt from the tenant row, for when no stored payload is usable.
export function rebuildInput(
  tenant: RetryTenant,
  step: ProvisioningStep,
): object {
  const base: TenantDbReadyPayload = {
    tenantId: tenant.id,
    subdomain: tenant.subdomain,
    planId: tenant.planId,
    ...(tenant.isTest ? { test: true } : {}),
  };
  if (step === 'dbStatus') {
    const requested: TenantRequestedPayload = {
      ...base,
      ...(tenant.schemaName ? { schemaName: tenant.schemaName } : {}),
    };
    return requested;
  }
  if (step === 'notificationStatus') {
    const skipped = tenant.billingStatus === StepStatus.SKIPPED;
    const billing: TenantBillingActivePayload = {
      ...base,
      stripeCustomerId: tenant.stripeCustomerId,
      stripeSubscriptionId: tenant.stripeSubscriptionId,
      subscriptionStatus: skipped ? 'skipped' : 'unknown',
      trialEnd: null,
      ...(skipped
        ? {
            skipped: true,
            skipReason: tenant.isTest ? 'test' : 'not-connected',
          }
        : {}),
    };
    return billing;
  }
  return base;
}

// A stored payload is only reused when it is an object about this very tenant.
export function storedInput(
  payload: Prisma.JsonValue | null | undefined,
  tenantId: string,
): object | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }
  return (payload as Record<string, unknown>).tenantId === tenantId
    ? payload
    : undefined;
}
