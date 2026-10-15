import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import api from './api';

export interface SessionUser {
    id: string;
    email: string;
    name: string | null;
    role: string;
    tenantId: string;
}

export interface Session {
    accessToken: string;
    refreshToken: string;
    user: SessionUser;
}

const TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_KEY = 'user';

function readStored(): Session | null {
    try {
        const accessToken = localStorage.getItem(TOKEN_KEY);
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
        const user = localStorage.getItem(USER_KEY);
        if (!accessToken || !user) return null;
        return { accessToken, refreshToken: refreshToken ?? '', user: JSON.parse(user) as SessionUser };
    } catch {
        return null;
    }
}

function persist(next: Session | null) {
    try {
        if (next) {
            localStorage.setItem(TOKEN_KEY, next.accessToken);
            localStorage.setItem(REFRESH_TOKEN_KEY, next.refreshToken);
            localStorage.setItem(USER_KEY, JSON.stringify(next.user));
        } else {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(REFRESH_TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
        }
    } catch {
        // Storage can be unavailable (private mode); the in-memory session still works.
    }
}

let current: Session | null = readStored();
const listeners = new Set<() => void>();

export const sessionStore = {
    get: (): Session | null => current,
    set(next: Session | null) {
        current = next;
        persist(next);
        listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
};

const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];

api.interceptors.request.use((config) => {
    if (current && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${current.accessToken}`;
    }
    return config;
});

// Refresh tokens are single-use, so concurrent 401s must share one refresh call.
let refreshing: Promise<Session | null> | null = null;

function refreshSession(): Promise<Session | null> {
    if (!refreshing) {
        const refreshToken = current?.refreshToken;
        refreshing = (async () => {
            if (!refreshToken) return null;
            try {
                const { data } = await api.post<Session>('/auth/refresh', { refreshToken });
                sessionStore.set(data);
                return data;
            } catch {
                sessionStore.set(null);
                return null;
            }
        })().finally(() => {
            refreshing = null;
        });
    }
    return refreshing;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const original = error.config as RetriableConfig | undefined;
        const isAuthCall = AUTH_PATHS.some((p) => original?.url?.startsWith(p));
        if (error.response?.status === 401 && original && !original._retry && !isAuthCall && current) {
            original._retry = true;
            const next = await refreshSession();
            if (next) {
                original.headers.Authorization = `Bearer ${next.accessToken}`;
                return api(original);
            }
        }
        return Promise.reject(error);
    },
);
