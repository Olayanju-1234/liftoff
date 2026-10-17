import {
  PROVISIONING_STEP_NAMES,
  STEP_MODES,
  type DeprovisionPart,
  type ProvisioningStepName,
  type StepMode,
} from '@liftoff/shared-types';
import type { Tenant } from '.prisma/tenant-client';
import type { ProvisioningStep, TeardownStep } from './dead-letters';

// The API's step names and the Tenant columns that hold each step's status.
export const STEP_COLUMN: Record<ProvisioningStepName, ProvisioningStep> = {
  database: 'dbStatus',
  address: 'dnsStatus',
  credentials: 'credentialsStatus',
  billing: 'billingStatus',
  welcome: 'notificationStatus',
};

export const STEP_NAME = Object.fromEntries(
  PROVISIONING_STEP_NAMES.map((step) => [STEP_COLUMN[step], step]),
) as Record<ProvisioningStep, ProvisioningStepName>;

export const nextStep = (
  step: ProvisioningStepName,
): ProvisioningStepName | undefined =>
  PROVISIONING_STEP_NAMES[PROVISIONING_STEP_NAMES.indexOf(step) + 1];

export const isStepName = (value: unknown): value is ProvisioningStepName =>
  typeof value === 'string' &&
  (PROVISIONING_STEP_NAMES as readonly string[]).includes(value);

export type StepModes = Partial<Record<ProvisioningStepName, StepMode>>;

// Tenant.stepModes as written by dispatch; anything else in the JSON is dropped.
export function storedStepModes(raw: unknown): StepModes {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const source = raw as Record<string, unknown>;
  const modes: StepModes = {};
  for (const step of PROVISIONING_STEP_NAMES) {
    const mode = source[step];
    if (
      typeof mode === 'string' &&
      (STEP_MODES as readonly string[]).includes(mode)
    ) {
      modes[step] = mode as StepMode;
    }
  }
  return modes;
}

// How a step ran for this tenant. Nothing recorded means builtin: every tenant from before
// custom steps, and a step the saga never reached (its builtin teardown is a no-op).
export const ranAs = (
  tenant: Pick<Tenant, 'stepModes'>,
  step: ProvisioningStepName,
): StepMode => storedStepModes(tenant.stepModes)[step] ?? 'builtin';

// Where a step's removal shows on the tenant; address and welcome have no builtin teardown.
export const TEARDOWN_COLUMN: Partial<
  Record<ProvisioningStepName, TeardownStep>
> = {
  database: 'teardownDbStatus',
  credentials: 'teardownCredentialsStatus',
  billing: 'teardownBillingStatus',
};

export const STEP_FOR_PART: Record<DeprovisionPart, ProvisioningStepName> = {
  db: 'database',
  credentials: 'credentials',
  billing: 'billing',
};
