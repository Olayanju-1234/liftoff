import { createContext, useContext } from 'react';
import type { SessionUser } from './session';

export interface RegisterData {
    email: string;
    password: string;
    name?: string;
    tenantName: string;
    subdomain: string;
}

export interface AuthContextType {
    user: SessionUser | null;
    accessToken: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (data: RegisterData) => Promise<void>;
    logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
