import type { DemoFailStep } from '@liftoff/shared-types';
import type { ProvisioningStep } from '../tenants/dead-letters';

// Every demo tenant belongs here. Not a cuid, so no signup can ever be given this id.
export const DEMO_ORGANISATION_ID = 'liftoff-demo';

// The SaaS company the visitor plays. No users: nobody signs in to it, and nobody is emailed.
export const DEMO_ORGANISATION = {
  id: DEMO_ORGANISATION_ID,
  name: 'Your SaaS',
  handle: 'liftoff-demo',
  baseDomain: 'yoursaas.example',
};

export const DEMO_PLAN_ID = 'pro';

// Sized for a shared 1-vCPU box: each demo is a schema and five worker messages.
export const DEMO_LIFETIME_MS = 15 * 60_000;
export const DEMO_MAX_PER_IP_PER_HOUR = 5;
export const DEMO_MAX_LIVE = 20;
export const DEMO_RATE_WINDOW_MS = 60 * 60_000;
// A full sandbox frees up as demos expire; a minute is a fair poll.
export const DEMO_FULL_RETRY_AFTER_S = 60;

export const DEMO_FAIL_COLUMN: Record<DemoFailStep, ProvisioningStep> = {
  db: 'dbStatus',
  dns: 'dnsStatus',
  credentials: 'credentialsStatus',
  billing: 'billingStatus',
  notification: 'notificationStatus',
};

export const DEMO_FAIL_STEP_BY_COLUMN = Object.fromEntries(
  Object.entries(DEMO_FAIL_COLUMN).map(([step, column]) => [column, step]),
) as Record<ProvisioningStep, DemoFailStep>;

// The worker each failStep stands for, as the dead letter names it.
export const DEMO_FAIL_WORKER: Record<DemoFailStep, string> = {
  db: 'db-provisioner',
  dns: 'dns-provisioner',
  credentials: 'credentials',
  billing: 'billing',
  notification: 'notification',
};
