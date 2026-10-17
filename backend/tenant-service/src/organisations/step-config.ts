import {
  CUSTOM_STEP_DEFAULT_TIMEOUT_MS,
  CUSTOM_STEP_MAX_TIMEOUT_MS,
  CUSTOM_STEP_MIN_TIMEOUT_MS,
  PROVISIONING_STEP_NAMES,
  STEP_MODES,
  type EffectiveStepConfig,
  type EffectiveStepConfigEntry,
  type ProvisioningStepName,
  type StepConfigEntry,
  type StepMode,
} from '@liftoff/shared-types';

export type StoredStepConfig = Partial<
  Record<ProvisioningStepName, StepConfigEntry>
>;

// What PUT /organisation { stepConfig } carries once validated: an entry, null, or nothing.
export type StepConfigUpdate = Partial<
  Record<ProvisioningStepName, StepConfigEntry | null | undefined>
>;

const isStepMode = (value: unknown): value is StepMode =>
  typeof value === 'string' &&
  (STEP_MODES as readonly string[]).includes(value);

const isTimeout = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= CUSTOM_STEP_MIN_TIMEOUT_MS &&
  value <= CUSTOM_STEP_MAX_TIMEOUT_MS;

// The stored JSON is whatever an earlier PUT wrote; an entry it cannot read is builtin.
export function storedStepConfig(raw: unknown): StoredStepConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const source = raw as Record<string, unknown>;
  const config: StoredStepConfig = {};
  for (const step of PROVISIONING_STEP_NAMES) {
    const entry = source[step];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const { mode, url, timeoutMs } = entry as Record<string, unknown>;
    if (!isStepMode(mode)) {
      continue;
    }
    config[step] = {
      mode,
      ...(typeof url === 'string' && url ? { url } : {}),
      ...(isTimeout(timeoutMs) ? { timeoutMs } : {}),
    };
  }
  return config;
}

const toEffective = (
  entry: StepConfigEntry | undefined,
): EffectiveStepConfigEntry => ({
  mode: entry?.mode ?? 'builtin',
  url: entry?.url ?? null,
  timeoutMs: entry?.timeoutMs ?? CUSTOM_STEP_DEFAULT_TIMEOUT_MS,
});

export const stepConfigFor = (
  raw: unknown,
  step: ProvisioningStepName,
): EffectiveStepConfigEntry => toEffective(storedStepConfig(raw)[step]);

export function effectiveStepConfig(raw: unknown): EffectiveStepConfig {
  const stored = storedStepConfig(raw);
  return Object.fromEntries(
    PROVISIONING_STEP_NAMES.map((step) => [step, toEffective(stored[step])]),
  ) as EffectiveStepConfig;
}

// Each step sent replaces its mode and keeps the stored url/timeout it leaves out;
// null puts the step back to builtin with nothing kept.
export function mergeStepConfig(
  current: StoredStepConfig,
  update: StepConfigUpdate,
): StoredStepConfig {
  const merged: StoredStepConfig = { ...current };
  for (const step of PROVISIONING_STEP_NAMES) {
    const entry = update[step];
    if (entry === undefined) {
      continue;
    }
    if (entry === null) {
      delete merged[step];
      continue;
    }
    const url = entry.url ?? current[step]?.url;
    const timeoutMs = entry.timeoutMs ?? current[step]?.timeoutMs;
    merged[step] = {
      mode: entry.mode,
      ...(url ? { url } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    };
  }
  return merged;
}

export const customStepNames = (
  config: StoredStepConfig,
): ProvisioningStepName[] =>
  PROVISIONING_STEP_NAMES.filter((step) => config[step]?.mode === 'custom');
