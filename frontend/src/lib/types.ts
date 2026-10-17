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
    createdAt: string;
    updatedAt: string;
}

export type TenantStatus = 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'FAILED' | 'CANCELLED';
export type StepStatus = 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

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
