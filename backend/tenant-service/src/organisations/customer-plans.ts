import type { Prisma } from '.prisma/tenant-client';
import {
  CUSTOMER_PLAN_ID_PATTERN,
  DEFAULT_CUSTOMER_PLANS,
  type CustomerPlan,
  type StripePrices,
} from '@liftoff/shared-types';

// The stored JSON is whatever an earlier PUT wrote; anything unusable means the defaults.
export function effectivePlans(raw: unknown): CustomerPlan[] {
  if (!Array.isArray(raw)) {
    return [...DEFAULT_CUSTOMER_PLANS];
  }
  const plans = raw.flatMap((entry): CustomerPlan[] => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return [];
    }
    const { id, name, description } = entry as Record<string, unknown>;
    if (
      typeof id !== 'string' ||
      !CUSTOMER_PLAN_ID_PATTERN.test(id) ||
      typeof name !== 'string' ||
      !name
    ) {
      return [];
    }
    return [
      {
        id,
        name,
        ...(typeof description === 'string' && description
          ? { description }
          : {}),
      },
    ];
  });
  return plans.length > 0 ? plans : [...DEFAULT_CUSTOMER_PLANS];
}

export const toStoredPlans = (plans: CustomerPlan[]): Prisma.InputJsonArray =>
  plans.map(({ id, name, description }) => ({
    id,
    name,
    ...(description ? { description } : {}),
  }));

// A tenant on a plan the company has since removed still reads by its id.
export const planNameFor = (plans: CustomerPlan[], planId: string): string =>
  plans.find((plan) => plan.id === planId)?.name ?? planId;

// What POST /tenants sent: a plan id, or its name (older clients sent "Starter").
export function resolvePlanId(
  plans: CustomerPlan[],
  requested: string,
): string | undefined {
  const wanted = requested.trim().toLowerCase();
  return plans.find(
    (plan) => plan.id === wanted || plan.name.toLowerCase() === wanted,
  )?.id;
}

// Prices as stored: only plan ids with a Price ID. Billing looks a tenant's plan up here,
// so a price set for a plan that was later removed still works for tenants on it.
export function storedPrices(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      (entry): entry is [string, string] =>
        CUSTOMER_PLAN_ID_PATTERN.test(entry[0]) &&
        typeof entry[1] === 'string' &&
        entry[1] !== '',
    ),
  );
}

// What GET /organisation shows: a price (or null) for each of the company's plans.
export const pricesFor = (
  plans: CustomerPlan[],
  stored: Record<string, string>,
): StripePrices =>
  Object.fromEntries(plans.map((plan) => [plan.id, stored[plan.id] ?? null]));
