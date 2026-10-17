import type { EventLog, StepStatus, Tenant } from './types';

export type StepKey = 'dbStatus' | 'dnsStatus' | 'credentialsStatus' | 'billingStatus' | 'notificationStatus';

export interface Stage {
    index: number;
    key: StepKey;
    code: string;
    short: string;
    name: string;
    service: string;
    queue: string;
    consumes: string;
    emits: string;
    deadLetterKey: string;
    action: string;
    detail: string;
    typicalMs: number;
}

export const EXCHANGE = 'provisioning.direct';
export const DLX = 'dlx.provisioning';
export const STALL_AFTER_MS = 60_000;
// tenant-service fails a step with no progress for this long; the 30-minute sweeper is the backstop.
export const STEP_TIMEOUT_MS = 2 * 60_000;
export const SWEEP_AFTER_MS = 30 * 60_000;

export const STAGES: Stage[] = [
    {
        index: 0,
        key: 'dbStatus',
        code: 'S1',
        short: 'DB',
        name: 'Database schema',
        service: 'db-provisioner',
        queue: 'db-provisioner-queue',
        consumes: 'tenant.requested',
        emits: 'tenant.db.ready',
        deadLetterKey: 'db-provisioner.failed',
        action: 'CREATE SCHEMA',
        detail: 'Creates an isolated Postgres schema for the tenant.',
        typicalMs: 180,
    },
    {
        index: 1,
        key: 'dnsStatus',
        code: 'S2',
        short: 'DNS',
        name: 'DNS record',
        service: 'dns-provisioner',
        queue: 'dns-provisioner-queue',
        consumes: 'tenant.db.ready',
        emits: 'tenant.dns.ready',
        deadLetterKey: 'dns-provisioner.failed',
        action: 'REGISTER HOST',
        detail: 'Registers the tenant subdomain.',
        typicalMs: 2010,
    },
    {
        index: 2,
        key: 'credentialsStatus',
        code: 'S3',
        short: 'KEY',
        name: 'API credentials',
        service: 'credentials',
        queue: 'credentials-queue',
        consumes: 'tenant.dns.ready',
        emits: 'tenant.credentials.ready',
        deadLetterKey: 'credentials.failed',
        action: 'ISSUE KEYS',
        detail: 'Generates an sk_live_ API key. A redelivered message republishes instead of failing.',
        typicalMs: 95,
    },
    {
        index: 3,
        key: 'billingStatus',
        code: 'S4',
        short: 'BIL',
        name: 'Billing',
        service: 'billing',
        queue: 'billing-queue',
        consumes: 'tenant.credentials.ready',
        emits: 'tenant.billing.active',
        deadLetterKey: 'billing.failed',
        action: 'STRIPE SUB',
        detail: 'Creates a Stripe customer and a subscription with a 14-day trial.',
        typicalMs: 1240,
    },
    {
        index: 4,
        key: 'notificationStatus',
        code: 'S5',
        short: 'NTF',
        name: 'Welcome + activate',
        service: 'notification',
        queue: 'notification-queue',
        consumes: 'tenant.billing.active',
        emits: 'tenant.provisioning.complete',
        deadLetterKey: 'notification.failed',
        action: 'WELCOME',
        detail: 'Sends the welcome email, then publishes provisioning.complete.',
        typicalMs: 520,
    },
];

export const PLANS = [
    { id: 'starter', name: 'Starter', note: 'Small teams. Price from STRIPE_PRICE_STARTER.' },
    { id: 'pro', name: 'Pro', note: 'Growing tenants. Price from STRIPE_PRICE_PRO.' },
    { id: 'enterprise', name: 'Enterprise', note: 'Large tenants. Price from STRIPE_PRICE_ENTERPRISE.' },
] as const;

export type StageState = StepStatus | 'STALLED';

export type Condition = 'active' | 'running' | 'stalled' | 'waiting' | 'failed' | 'cancelled' | 'suspended';

export function schemaName(subdomain: string) {
    return `tenant_${subdomain.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

export function planLabel(t: Pick<Tenant, 'planId' | 'plan'>) {
    const raw = t.plan?.name ?? t.planId;
    const trimmed = raw.replace(/^plan_/, '');
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function activeStage(t: Tenant): Stage | undefined {
    return STAGES.find((s) => t[s.key] === 'IN_PROGRESS');
}

export function failedStage(t: Tenant): Stage | undefined {
    return STAGES.find((s) => t[s.key] === 'FAILED');
}

export function completedCount(t: Tenant) {
    return STAGES.filter((s) => t[s.key] === 'SUCCESS').length;
}

export function isUnstarted(t: Tenant) {
    return t.status === 'PROVISIONING' && STAGES.every((s) => t[s.key] === 'PENDING');
}

export function quietFor(t: Tenant, now: number) {
    return Math.max(0, now - Date.parse(t.updatedAt));
}

export function isStalled(t: Tenant, now: number) {
    return t.status === 'PROVISIONING' && !!activeStage(t) && quietFor(t, now) > STALL_AFTER_MS;
}

export function sweepAt(t: Tenant) {
    return Date.parse(t.updatedAt) + SWEEP_AFTER_MS;
}

export function stepTimeoutAt(t: Tenant) {
    return Date.parse(t.updatedAt) + STEP_TIMEOUT_MS;
}

export function isStepTimeout(error: string | undefined) {
    return !!error && /timed out/i.test(error);
}

export function stageState(t: Tenant, stage: Stage, now: number): StageState {
    const status = t[stage.key];
    if (status === 'IN_PROGRESS' && isStalled(t, now)) return 'STALLED';
    return status;
}

export function condition(t: Tenant, now: number): Condition {
    switch (t.status) {
        case 'ACTIVE':
            return 'active';
        case 'FAILED':
            return 'failed';
        case 'CANCELLED':
            return 'cancelled';
        case 'SUSPENDED':
            return 'suspended';
        default:
            if (failedStage(t)) return 'failed';
            if (isUnstarted(t)) return 'waiting';
            if (isStalled(t, now)) return 'stalled';
            return 'running';
    }
}

export interface StageTiming {
    stage: Stage;
    start?: number;
    end?: number;
}

export interface Timeline {
    t0: number;
    stages: StageTiming[];
    completeAt?: number;
}

export function stageTimings(t: Tenant, events: EventLog[]): Timeline {
    const firstSeen = new Map<string, number>();
    for (const e of events) {
        if (e.status === 'Error') continue;
        const ts = Date.parse(e.timestamp);
        const prev = firstSeen.get(e.eventType);
        if (prev === undefined || ts < prev) firstSeen.set(e.eventType, ts);
    }
    const t0 = firstSeen.get('tenant.created') ?? Date.parse(t.createdAt);
    let prevEnd: number | undefined = t0;
    const stages = STAGES.map((stage) => {
        const status = t[stage.key];
        const end = status === 'SUCCESS' ? firstSeen.get(stage.emits) : undefined;
        let start: number | undefined;
        if (status !== 'PENDING') {
            start = prevEnd ?? (status === 'IN_PROGRESS' ? Date.parse(t.updatedAt) : undefined);
        }
        prevEnd = end;
        return { stage, start, end };
    });
    return { t0, stages, completeAt: firstSeen.get('tenant.provisioning.complete') };
}

// Hop n carries the message that starts stage n; hop 5 returns provisioning.complete to tenant-service.
export function hopForEvent(eventType: string): number | undefined {
    if (eventType === 'tenant.created') return 0;
    const i = STAGES.findIndex((s) => s.emits === eventType);
    return i >= 0 ? i + 1 : undefined;
}

export function stageForEvent(eventType: string): Stage | undefined {
    return STAGES.find((s) => s.emits === eventType);
}

const EVENT_LABELS: Record<string, string> = {
    'tenant.created': 'Tenant created, tenant.requested published',
    'tenant.db.ready': 'Schema created',
    'tenant.dns.ready': 'Subdomain registered',
    'tenant.credentials.ready': 'API key issued',
    'tenant.billing.active': 'Stripe subscription active',
    'tenant.billing.skipped': 'Billing skipped (test tenant)',
    'tenant.provisioning.complete': 'Provisioning complete',
    'tenant.cancelled': 'Provisioning cancelled',
    'tenant.deleted': 'Tenant deleted',
};

export function eventLabel(eventType: string) {
    return EVENT_LABELS[eventType] ?? eventType.replace(/^tenant\./, '').replace(/\./g, ' ');
}

export function eventErrorText(e: EventLog): string | undefined {
    const value = e.payload?.error;
    return typeof value === 'string' ? value : undefined;
}

export function cancelReasonFrom(t: Tenant, events?: EventLog[]): string | undefined {
    if (t.cancelReason) return t.cancelReason;
    const ev = events?.find((e) => e.eventType === 'tenant.cancelled');
    const reason = ev?.payload?.reason;
    return typeof reason === 'string' ? reason : undefined;
}

export function isSweeperCancel(reason: string | undefined) {
    return !!reason && /timeout/i.test(reason);
}
