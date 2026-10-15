import type { PlanId } from '@liftoff/shared-types';

export interface PlanDefaults {
  name: string;
  maxUsers: number;
  maxApiKeys: number;
}

export const PLAN_CATALOG: Record<PlanId, PlanDefaults> = {
  starter: { name: 'Starter', maxUsers: 5, maxApiKeys: 2 },
  pro: { name: 'Pro', maxUsers: 25, maxApiKeys: 10 },
  enterprise: { name: 'Enterprise', maxUsers: 1000, maxApiKeys: 100 },
};

export const DEFAULT_PLAN_ID: PlanId = 'starter';

// IDs the seed wrote before they matched billing's price map.
export const LEGACY_PLAN_IDS: Record<PlanId, string> = {
  starter: 'plan_basic',
  pro: 'plan_pro',
  enterprise: 'plan_enterprise',
};
