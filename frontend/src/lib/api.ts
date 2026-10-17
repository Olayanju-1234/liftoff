import axios from 'axios';
import type { Tenant, EventLog, Organisation, PlanId, UserSettings } from './types';

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
export const cancelTenant = (id: string, reason?: string) =>
    api.post<Tenant>(`/tenants/${id}/cancel`, { reason }).then(res => res.data);

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

// Organisation APIs
export const getOrganisation = () => api.get<Organisation>('/organisation').then((res) => res.data);
export interface OrganisationPatch {
    name?: string;
    baseDomain?: string | null;
    // The company's Stripe secret key; null disconnects. Never comes back in a response.
    stripeSecretKey?: string | null;
    stripePrices?: Partial<Record<PlanId, string | null>> | null;
}
export const updateOrganisation = (patch: OrganisationPatch) => api.put<Organisation>('/organisation', patch).then((res) => res.data);

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
