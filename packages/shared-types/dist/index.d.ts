export declare class CreateTenantDto {
    name: string;
    subdomain: string;
    planId: string;
}
export declare class CancelTenantDto {
    reason?: string;
}
export declare class RegisterDto {
    email: string;
    password: string;
    name?: string;
    tenantName: string;
    subdomain: string;
}
export declare class LoginDto {
    email: string;
    password: string;
}
export declare class RefreshTokenDto {
    refreshToken: string;
}
export declare class UpdateSettingsDto {
    firstName?: string;
    lastName?: string;
    email?: string;
    emailNotifications?: boolean;
    failedJobAlerts?: boolean;
}
export interface TenantRequestedPayload {
    tenantId: string;
    subdomain: string;
    planId: string;
}
export interface TenantDbReadyPayload {
    tenantId: string;
    subdomain: string;
    planId: string;
}
export interface TenantDnsReadyPayload {
    tenantId: string;
    subdomain: string;
    planId: string;
}
export interface TenantCredentialsReadyPayload {
    tenantId: string;
    subdomain: string;
    planId: string;
}
export interface TenantBillingActivePayload {
    tenantId: string;
    subdomain: string;
    planId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    subscriptionStatus: string;
    trialEnd: string | null;
}
export interface ProvisioningCompletePayload {
    tenantId: string;
    subdomain: string;
}
