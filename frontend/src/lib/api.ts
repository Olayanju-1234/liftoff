import axios from 'axios';
import type { ApiKey, CreatedApiKey, Tenant, EventLog, Organisation, PlanId, PublicTenantStatus, UpdatedOrganisation, UserSettings } from './types';
import type { SessionUser } from './session';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
});

// Tenant APIs
export const getTenants = () => api.get<Tenant[]>('/tenants').then(res => res.data);
export const getTenant = (id: string) => api.get<Tenant>(`/tenants/${id}`).then(res => res.data);
// Each attempt from the dashboard carries a key, so a retried click cannot create two tenants.
export const createTenant = (data: { name: string; subdomain: string; planId: string; test?: boolean }, idempotencyKey?: string) =>
    api.post<Tenant>('/tenants', data, idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : undefined).then(res => res.data);
export const deleteTenant = (id: string) => api.delete<Tenant>(`/tenants/${id}`).then((res) => res.data);
// Runs the failed step of a FAILED tenant again; answers with the tenant PROVISIONING.
export const retryTenant = (id: string) => api.post<Tenant>(`/tenants/${id}/retry`).then((res) => res.data);
export const cancelTenant = (id: string, reason?: string) =>
    api.post<Tenant>(`/tenants/${id}/cancel`, { reason }).then(res => res.data);

// Public status page: no credentials. The interceptor adds none when there is no session.
export const getPublicStatus = (token: string) => api.get<PublicTenantStatus>(`/status/${encodeURIComponent(token)}`).then((res) => res.data);

// Event APIs
export const getEvents = () => api.get<EventLog[]>('/events').then(res => res.data);
export const getTenantEvents = (id: string) => api.get<EventLog[]>(`/tenants/${id}/events`).then(res => res.data);

// Health check API
export const checkHealth = async () => {
    const start = Date.now();
    try {
        await api.get('/health');
        return { status: 'Operational' as const, latency: Date.now() - start };
    } catch {
        return { status: 'Down' as const, latency: Date.now() - start };
    }
};

// Settings APIs
export const getSettings = async (): Promise<UserSettings> => {
    const response = await api.get<UserSettings>('/settings');
    return response.data;
};

export const saveSettings = async (settings: Partial<UserSettings>): Promise<UserSettings> => {
    const response = await api.put<UserSettings>('/settings', settings);
    return response.data;
};

// The signed-in user as the API sees them now (emailVerified can be newer than the stored session).
export const getMe = () => api.get<SessionUser>('/auth/me').then((res) => res.data);

// Organisation APIs
export const getOrganisation = () => api.get<Organisation>('/organisation').then((res) => res.data);
export interface OrganisationPatch {
    name?: string;
    baseDomain?: string | null;
    // Where tenant.active, tenant.failed and tenant.deleted are POSTed; null turns deliveries off.
    // A new URL comes back with webhookSecret, once.
    webhookUrl?: string | null;
    rotateWebhookSecret?: boolean;
    // The company's Stripe secret key; null disconnects. Never comes back in a response.
    stripeSecretKey?: string | null;
    stripePrices?: Partial<Record<PlanId, string | null>> | null;
    // Hides the finished onboarding checklist for good.
    dismissOnboarding?: boolean;
}
export const updateOrganisation = (patch: OrganisationPatch) => api.put<UpdatedOrganisation>('/organisation', patch).then((res) => res.data);

// API keys. The key itself is only in the create response.
export const getApiKeys = () => api.get<ApiKey[]>('/api-keys').then((res) => res.data);
export const createApiKey = (name: string) => api.post<CreatedApiKey>('/api-keys', { name }).then((res) => res.data);
export const revokeApiKey = (id: string) => api.delete(`/api-keys/${id}`).then(() => undefined);

// Email verification and password reset
export const verifyEmail = (token: string) =>
    api.post<{ id: string; email: string; emailVerified: true }>('/auth/verify-email', { token }).then((res) => res.data);
export const resendVerification = () => api.post<{ message: string }>('/auth/resend-verification').then((res) => res.data);
export const forgotPassword = (email: string) => api.post<{ message: string }>('/auth/forgot-password', { email }).then((res) => res.data);
export const resetPassword = (token: string, password: string) =>
    api.post<{ message: string }>('/auth/reset-password', { token, password }).then((res) => res.data);

export const confirmEmailChange = (token: string) =>
    api.post<{ id: string; email: string }>('/settings/email/confirm', { token }).then((res) => res.data);

export default api;
