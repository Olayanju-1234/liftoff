export declare class CreateTenantDto {
    name: string;
    subdomain: string;
    planId: string;
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
}
export interface ProvisioningCompletePayload {
    tenantId: string;
    subdomain: string;
}
