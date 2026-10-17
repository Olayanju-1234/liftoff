export declare class CreateTenantDto {
    name: string;
    subdomain: string;
    planId: string;
    test?: boolean;
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
export declare class VerifyEmailDto {
    token: string;
}
export declare class ForgotPasswordDto {
    email: string;
}
export declare class ResetPasswordDto {
    token: string;
    password: string;
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
export declare const STRIPE_SECRET_KEY_PATTERN: RegExp;
export declare const STRIPE_SECRET_KEY_MAX_LENGTH = 200;
export declare const STRIPE_PRICE_ID_PATTERN: RegExp;
export declare class StripePricesDto {
    starter?: string | null;
    pro?: string | null;
    enterprise?: string | null;
}
export declare class UpdateOrganisationDto {
    name?: string;
    webhookUrl?: string | null;
    rotateWebhookSecret?: boolean;
    baseDomain?: string | null;
    stripeSecretKey?: string | null;
    stripePrices?: StripePricesDto | null;
    dismissOnboarding?: boolean;
}
export type StripePrices = Record<PlanId, string | null>;
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
export type TenantWebhookEvent = 'tenant.active' | 'tenant.failed' | 'tenant.deleted';
export interface TenantWebhookPayload<TTenant = unknown> {
    event: TenantWebhookEvent;
    tenant: TTenant;
}
export declare const PLAN_IDS: readonly ["starter", "pro", "enterprise"];
export type PlanId = (typeof PLAN_IDS)[number];
export declare const STATUS_TOKEN_PATTERN: RegExp;
export type PublicTenantState = 'setting-up' | 'ready' | 'needs-attention' | 'stopped' | 'removed';
export type PublicStepState = 'waiting' | 'in-progress' | 'done' | 'skipped' | 'failed' | 'stopped';
export interface PublicTenantStatus {
    company: string;
    name: string;
    state: PublicTenantState;
    done: number;
    total: number;
    steps: {
        name: string;
        state: PublicStepState;
    }[];
    address: string | null;
    updatedAt: string;
}
export declare const LIVE_TENANT_STATUSES: readonly ["PROVISIONING", "FAILED", "ACTIVE"];
export type LiveTenantStatus = (typeof LIVE_TENANT_STATUSES)[number];
export declare const isLiveTenant: (status: string) => status is LiveTenantStatus;
export interface TestModeFlag {
    test?: boolean;
}
export interface TenantRequestedPayload extends TestModeFlag {
    tenantId: string;
    subdomain: string;
    planId: string;
    schemaName?: string;
}
export interface TenantDbReadyPayload extends TestModeFlag {
    tenantId: string;
    subdomain: string;
    planId: string;
}
export interface TenantDnsReadyPayload extends TestModeFlag {
    tenantId: string;
    subdomain: string;
    planId: string;
}
export interface TenantCredentialsReadyPayload extends TestModeFlag {
    tenantId: string;
    subdomain: string;
    planId: string;
}
export type BillingSkipReason = 'test' | 'not-connected';
export interface TenantBillingActivePayload extends TestModeFlag {
    tenantId: string;
    subdomain: string;
    planId: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    subscriptionStatus: string;
    trialEnd: string | null;
    skipped?: boolean;
    skipReason?: BillingSkipReason;
}
export type NotificationSkipReason = 'no-provider' | 'no-recipient' | 'not-configured';
export interface NotificationOutcome {
    sent: boolean;
    recipients: number;
    skipReason?: NotificationSkipReason;
}
export interface ProvisioningCompletePayload {
    tenantId: string;
    subdomain: string;
    notification?: NotificationOutcome;
}
export interface TenantDeprovisionPayload extends TestModeFlag {
    tenantId: string;
    subdomain: string;
    schemaName: string | null;
    stripeSubscriptionId: string | null;
    reason: string;
}
export declare const DEPROVISION_PARTS: readonly ["db", "credentials", "billing"];
export type DeprovisionPart = (typeof DEPROVISION_PARTS)[number];
export interface TenantDeprovisionDonePayload {
    tenantId: string;
    part: DeprovisionPart;
    skipped: boolean;
    detail?: string;
    warning?: string;
}
export interface TenantFailedPayload {
    tenantId: string;
    step: string;
    error: string;
}
export declare const INTERNAL_TOKEN_HEADER = "x-internal-token";
export interface InternalBillingConfig {
    tenantId: string;
    organisationId: string;
    test: boolean;
    stripeSubscriptionId: string | null;
    configured: boolean;
    stripeSecretKey: string | null;
    prices: StripePrices;
}
export interface InternalTenantNotification {
    tenant: {
        id: string;
        name: string;
        subdomain: string;
        address: string;
        planId: string;
        status: string;
        isTest: boolean;
    };
    organisation: {
        id: string;
        name: string;
    };
    recipients: {
        ready: string[];
        attention: string[];
    };
}
