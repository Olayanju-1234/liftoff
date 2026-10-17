// Tenant types
export interface Tenant {
    id: string;
    name: string;
    subdomain: string;
    status: TenantStatus;
    planId: string;
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
    stripePrices: Record<PlanId, string | null>;
    // Quotas on adding customers; test customers don't count. Raised by support on request.
    limits: { maxActiveTenants: number; maxProvisionsPerDay: number };
    createdAt: string;
    updatedAt: string;
}

export type PlanId = 'starter' | 'pro' | 'enterprise';
export const PLAN_IDS: PlanId[] = ['starter', 'pro', 'enterprise'];

export type TenantStatus = 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'FAILED' | 'CANCELLED' | 'DEPROVISIONING' | 'DELETED';
export type StepStatus = 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'SKIPPED';

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
