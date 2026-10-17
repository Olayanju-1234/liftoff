import { STAGES } from './pipeline';
import type { Condition, Stage, StageState, StepKey } from './pipeline';
import type { Tone } from './ui';

// Plain-language names for the Simple view. The technical event name sits under each as a secondary line.
export const STEP_NAMES: Record<StepKey, string> = {
    dbStatus: 'Creating your database',
    dnsStatus: 'Setting up your address',
    credentialsStatus: 'Generating API keys',
    billingStatus: 'Starting your trial',
    notificationStatus: 'Sending welcome email',
};

export const stepName = (stage: Stage) => STEP_NAMES[stage.key];

export const SIMPLE_STEPS = STAGES.map((stage) => ({ stage, name: STEP_NAMES[stage.key] }));

export type SimpleStatus = 'setting-up' | 'ready' | 'attention' | 'cancelled';

export const SIMPLE_STATUS: Record<SimpleStatus, { label: string; tone: Tone; live?: boolean }> = {
    'setting-up': { label: 'Setting up', tone: 'ignite', live: true },
    ready: { label: 'Ready', tone: 'go' },
    attention: { label: 'Needs attention', tone: 'abort' },
    cancelled: { label: 'Cancelled', tone: 'scrub' },
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
};

export const PLAN_BLURBS: Record<string, string> = {
    starter: 'For small teams',
    pro: 'For growing teams',
    enterprise: 'For large organisations',
};

// DNS is simulated, so the address is informational. Override the base domain per deployment.
const TENANT_DOMAIN = (import.meta.env.VITE_TENANT_DOMAIN as string | undefined)?.trim() || 'liftoff.ojusentinel.com';

export const tenantHost = (subdomain: string) => `${subdomain}.${TENANT_DOMAIN}`;
export const tenantUrl = (subdomain: string) => `https://${tenantHost(subdomain)}`;
