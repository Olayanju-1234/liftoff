import axios from 'axios';
import type { Tenant, EventLog, UserSettings } from './types';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000',
});

// Tenant APIs
export const getTenants = () => api.get<Tenant[]>('/tenants').then(res => res.data);
export const getTenant = (id: string) => api.get<Tenant>(`/tenants/${id}`).then(res => res.data);
export const createTenant = (data: { name: string; subdomain: string; planId: string }) =>
    api.post<Tenant>('/tenants', data).then(res => res.data);
export const deleteTenant = (id: string) => api.delete(`/tenants/${id}`).then(res => res.data);

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
    try {
        const response = await api.get<UserSettings>('/settings');
        return response.data;
    } catch (error) {
        // Fallback to defaults if API fails
        console.error('Failed to fetch settings from API, using defaults', error);
        return {
            firstName: 'DevOps',
            lastName: 'Engineer',
            email: 'ops@saascompany.com',
            emailNotifications: true,
            failedJobAlerts: true,
        };
    }
};

export const saveSettings = async (settings: Partial<UserSettings>): Promise<UserSettings> => {
    const response = await api.put<UserSettings>('/settings', settings);
    return response.data;
};

export default api;
