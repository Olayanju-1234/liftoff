export declare class CreateTenantDto {
    name: string;
    subdomain: string;
    planId: string;
}
export declare class CancelTenantDto {
    reason?: string;
}
export declare const HANDLE_PATTERN: RegExp;
export declare class RegisterDto {
    email: string;
    password: string;
    name?: string;
    companyName?: string;
    handle?: string;
    tenantName?: string;
    subdomain?: string;
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
export declare class ConfirmEmailChangeDto {
    token: string;
}
export declare class UpdateOrganisationDto {
    name?: string;
    webhookUrl?: string | null;
    rotateWebhookSecret?: boolean;
    baseDomain?: string | null;
}
export declare class CreateApiKeyDto {
    name: string;
}
export declare const API_KEY_HEADER = "x-api-key";
export declare const API_KEY_PREFIX = "lk_";
export declare const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
export declare const IDEMPOTENCY_KEY_MAX_LENGTH = 255;
export declare const IDEMPOTENT_REPLAYED_HEADER = "idempotent-replayed";
export declare const WEBHOOK_SIGNATURE_HEADER = "x-liftoff-signature";
export declare const WEBHOOK_EVENT_HEADER = "x-liftoff-event";
export declare const WEBHOOK_DELIVERY_HEADER = "x-liftoff-delivery";
export type TenantWebhookEvent = 'tenant.active' | 'tenant.failed';
export interface TenantWebhookPayload<TTenant = unknown> {
    event: TenantWebhookEvent;
    tenant: TTenant;
}
export declare const PLAN_IDS: readonly ["starter", "pro", "enterprise"];
export type PlanId = (typeof PLAN_IDS)[number];
export interface TenantRequestedPayload {
    tenantId: string;
    subdomain: string;
    planId: string;
    schemaName?: string;
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
