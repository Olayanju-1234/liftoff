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
    emailNotifications: boolean;
    failedJobAlerts: boolean;
}
