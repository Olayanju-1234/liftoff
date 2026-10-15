import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import api from './api';
import { sessionStore } from './session';
import type { Session } from './session';
import { AuthContext } from './auth-context';
import type { AuthContextType, RegisterData } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
    const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.get);

    const login = useCallback(async (email: string, password: string) => {
        const { data } = await api.post<Session>('/auth/login', { email, password });
        sessionStore.set(data);
    }, []);

    const register = useCallback(async (payload: RegisterData) => {
        const { data } = await api.post<Session>('/auth/register', payload);
        sessionStore.set(data);
    }, []);

    const logout = useCallback(async () => {
        try {
            await api.post('/auth/logout');
        } catch {
            // The local session is cleared either way.
        }
        sessionStore.set(null);
    }, []);

    const value = useMemo<AuthContextType>(
        () => ({
            user: session?.user ?? null,
            accessToken: session?.accessToken ?? null,
            isAuthenticated: !!session,
            isLoading: false,
            login,
            register,
            logout,
        }),
        [session, login, register, logout],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
