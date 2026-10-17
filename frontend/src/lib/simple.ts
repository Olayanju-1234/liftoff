import { STAGES, billingSkip, stepMode } from './pipeline';
import type { Condition, Stage, StageState, StepKey } from './pipeline';
import type { EventLog, Tenant } from './types';
import type { Tone } from './ui';

// Plain-language names for the Simple view. The technical event name sits under each as a secondary line.
export const STEP_NAMES: Record<StepKey, string> = {
    dbStatus: 'Creating their database',
    dnsStatus: 'Setting up their address',
    credentialsStatus: 'Generating their API keys',
    billingStatus: 'Starting their trial',
    notificationStatus: 'Letting your team know',
};

export const stepName = (stage: Stage) => STEP_NAMES[stage.key];

export const SIMPLE_STEPS = STAGES.map((stage) => ({ stage, name: STEP_NAMES[stage.key] }));

export type SimpleStatus = 'setting-up' | 'ready' | 'attention' | 'cancelled' | 'removing' | 'removed';

export const SIMPLE_STATUS: Record<SimpleStatus, { label: string; tone: Tone; live?: boolean }> = {
    'setting-up': { label: 'Setting up', tone: 'ignite', live: true },
    ready: { label: 'Ready', tone: 'go' },
    attention: { label: 'Needs attention', tone: 'abort' },
    cancelled: { label: 'Cancelled', tone: 'scrub' },
    removing: { label: 'Removing', tone: 'scrub', live: true },
    removed: { label: 'Removed', tone: 'scrub' },
};

export function simpleStatus(c: Condition): SimpleStatus {
    switch (c) {
        case 'active':
            return 'ready';
        case 'stalled':
        case 'failed':
            return 'attention';
        case 'cancelled':
        case 'suspended':
            return 'cancelled';
        case 'removing':
            return 'removing';
        case 'removed':
            return 'removed';
        default:
            return 'setting-up';
    }
}

export const SIMPLE_STEP_STATE: Record<StageState, { label: string; tone: Tone }> = {
    PENDING: { label: 'Waiting', tone: 'scrub' },
    IN_PROGRESS: { label: 'In progress', tone: 'ignite' },
    STALLED: { label: 'Stuck', tone: 'hold' },
    SUCCESS: { label: 'Done', tone: 'go' },
    FAILED: { label: 'Failed', tone: 'abort' },
    CANCELLED: { label: 'Cancelled', tone: 'scrub' },
    SKIPPED: { label: 'Skipped', tone: 'scrub' },
};

// A step as the Simple customer page reads it, given who ran it.
export function simpleStepLabel(t: Tenant, stage: Stage, state: StageState): string {
    const mode = stepMode(t, stage.api);
    if (mode === 'custom' && state === 'IN_PROGRESS') return 'Waiting on your system';
    if (mode === 'skipped' && state === 'SKIPPED') return 'Skipped';
    if (stage.key === 'billingStatus' && billingSkip(t) === 'not-connected') return 'Not connected';
    if (stage.key === 'notificationStatus' && state === 'SKIPPED') return 'Not emailed';
    return SIMPLE_STEP_STATE[state].label;
}

// The secondary line under a step: the event that finished it, or who it was left to.
export function simpleStepSource(t: Tenant, stage: Stage): string {
    const mode = stepMode(t, stage.api);
    if (mode === 'custom') return 'Your system · step.requested';
    if (mode === 'skipped') return 'Skipped in your settings';
    return stage.emits;
}

export const TRIAL_DAYS = 14;

// Billing starts the trial when it activates; fall back to creation time if that event isn't in the log.
export function trialEndsAt(t: Tenant, events: EventLog[]): number {
    const active = events.find((e) => e.eventType === 'tenant.billing.active' && e.status !== 'Error');
    const start = active ? Date.parse(active.timestamp) : Date.parse(t.createdAt);
    return start + TRIAL_DAYS * 86_400_000;
}

// DNS is simulated, so the address is informational. The API computes it from the company's
// base domain; this fallback only covers responses from before it did.
const TENANT_DOMAIN = (import.meta.env.VITE_TENANT_DOMAIN as string | undefined)?.trim() || 'liftoff.ojusentinel.com';

export const previewHost = (subdomain: string, baseDomain?: string | null) => `${subdomain}.${baseDomain || TENANT_DOMAIN}`;
export const tenantHost = (t: Pick<Tenant, 'subdomain' | 'address'>) => t.address ?? previewHost(t.subdomain);
export const tenantUrl = (t: Pick<Tenant, 'subdomain' | 'address'>) => `https://${tenantHost(t)}`;
