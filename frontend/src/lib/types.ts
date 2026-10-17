// Tenant types
export interface Tenant {
    id: string;
    name: string;
    subdomain: string;
    status: TenantStatus;
    // The customer's plan on the company's product: one of the organisation's customer plans.
    planId: string;
    // That plan as the company calls it (falls back to the id for a plan since removed).
    planName?: string;
    plan?: Plan;
    dbStatus: StepStatus;
    dnsStatus: StepStatus;
    credentialsStatus: StepStatus;
    billingStatus: StepStatus;
    notificationStatus: StepStatus;
    cancelledAt?: string | null;
    cancelReason?: string | null;
    // <subdomain>.<organisation base domain>, or the platform domain when the company has none. Display only.
    address?: string;
    // The Postgres schema db-provisioner created for it.
    schemaName?: string | null;
    // Test mode: set up like a real tenant, billing SKIPPED, outside the quotas, deletable any time.
    isTest?: boolean;
    // Public, tokenised progress page for the company's customer. No login; plain words only.
    statusUrl?: string;
    // What billing created in the company's Stripe account; null when the step was skipped.
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    // Teardown after DELETE (or cancel from ACTIVE/FAILED); null until then.
    teardownDbStatus?: StepStatus | null;
    teardownCredentialsStatus?: StepStatus | null;
    teardownBillingStatus?: StepStatus | null;
    deletedAt?: string | null;
    createdAt: string;
    updatedAt: string;
}

// The signed-up company. Its customers are the tenants.
export interface Organisation {
    id: string;
    name: string;
    handle: string;
    webhookUrl: string | null;
    webhookConfigured: boolean;
    baseDomain: string | null;
    // True once the company's Stripe key is stored (it is never returned). Until then billing is skipped.
    stripeConfigured: boolean;
    // The company's customer plans (the three defaults until it defines its own) and a Stripe price per plan id.
    plans: CustomerPlan[];
    stripePrices: Record<string, string | null>;
    // Quotas on adding customers; test customers don't count. Raised by support on request.
    limits: { maxActiveTenants: number; maxProvisionsPerDay: number };
    // Set once the finished onboarding checklist was dismissed; it never shows again after.
    onboardingDismissedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

// PUT /organisation answers with the organisation, plus the webhook signing secret the one
// time it is issued.
export interface UpdatedOrganisation extends Organisation {
    webhookSecret?: string;
}

// A company API key as listed: never the key itself, only enough to recognise it.
export interface ApiKey {
    id: string;
    name: string;
    prefix: string;
    lastUsedAt: string | null;
    createdAt: string;
}

// POST /api-keys: the only response that ever carries the full key.
export interface CreatedApiKey extends ApiKey {
    key: string;
}

// A customer plan as the company defines it under Settings → Billing. Its id is what POST /tenants takes as planId.
export interface CustomerPlan {
    id: string;
    name: string;
    description?: string;
}

// What every company starts with; the API returns these until the company defines its own.
export const DEFAULT_PLANS: CustomerPlan[] = [
    { id: 'starter', name: 'Starter', description: 'For small teams' },
    { id: 'pro', name: 'Pro', description: 'For growing teams' },
    { id: 'enterprise', name: 'Enterprise', description: 'For large organisations' },
];
export const PLAN_ID_OK = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
export const MAX_PLANS = 12;

// The company's plans, or the defaults when the API predates them or returned none.
export const organisationPlans = (o: Pick<Organisation, 'plans'> | undefined): CustomerPlan[] =>
    Array.isArray(o?.plans) && o.plans.length > 0 ? o.plans : DEFAULT_PLANS;

export type TenantStatus = 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'FAILED' | 'CANCELLED' | 'DEPROVISIONING' | 'DELETED';
export type StepStatus = 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'SKIPPED';

// GET /status/:token: what the company's customer sees while they wait. Plain words only.
export type PublicTenantState = 'setting-up' | 'ready' | 'needs-attention' | 'stopped' | 'removed';
export type PublicStepState = 'waiting' | 'in-progress' | 'done' | 'skipped' | 'failed' | 'stopped';
export interface PublicTenantStatus {
    company: string;
    name: string;
    state: PublicTenantState;
    done: number;
    total: number;
    steps: { name: string; state: PublicStepState }[];
    address: string | null;
    updatedAt: string;
}

// Plan types
export interface Plan {
    id: string;
    name: string;
    maxUsers: number;
    maxApiKeys: number;
}

// Event types
export interface EventLog {
    id: string;
    tenantId: string;
    eventType: string;
    status: 'Success' | 'Warning' | 'Error';
    payload: Record<string, unknown> | null;
    timestamp: string;
    tenant?: {
        id: string;
        name: string;
        subdomain?: string;
    };
}

// Service Health types
export interface ServiceHealth {
    name: string;
    status: 'Operational' | 'Degraded' | 'Down';
    latency: number;
    lastChecked: Date;
}

// Failed Job types
export interface FailedJob {
    id: string;
    eventType: string;
    tenantId: string;
    tenantName: string;
    error: string;
    timestamp: string;
    payload: Record<string, unknown> | null;
}

// Settings types
export interface UserSettings {
    firstName: string;
    lastName: string;
    email: string;
    // Set while a new email waits for its confirmation link; `email` stays the sign-in address.
    pendingEmail?: string | null;
    emailNotifications: boolean;
    failedJobAlerts: boolean;
}
