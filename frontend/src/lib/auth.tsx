import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from './api';

interface User {
    id: string;
    email: string;
    name: string | null;
    role: string;
    tenantId: string;
}

interface AuthContextType {
    user: User | null;
    accessToken: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (data: RegisterData) => Promise<void>;
    logout: () => Promise<void>;
}

interface RegisterData {
    email: string;
    password: string;
    name?: string;
    tenantName: string;
    subdomain: string;
}

interface AuthResponse {
    accessToken: string;
    refreshToken: string;
    user: User;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_KEY = 'user';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Initialize auth state from localStorage
    useEffect(() => {
        const storedToken = localStorage.getItem(TOKEN_KEY);
        const storedUser = localStorage.getItem(USER_KEY);

        if (storedToken && storedUser) {
            setAccessToken(storedToken);
            setUser(JSON.parse(storedUser));
            // Set default auth header
            api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
        }
        setIsLoading(false);
    }, []);

    // Set up axios interceptor for token refresh
    useEffect(() => {
        const interceptor = api.interceptors.response.use(
            (response) => response,
            async (error) => {
                const originalRequest = error.config;

                if (error.response?.status === 401 && !originalRequest._retry) {
                    originalRequest._retry = true;

                    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
                    if (refreshToken) {
                        try {
                            const response = await api.post<AuthResponse>('/auth/refresh', { refreshToken });
                            const { accessToken: newToken, refreshToken: newRefreshToken, user: newUser } = response.data;

                            localStorage.setItem(TOKEN_KEY, newToken);
                            localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
                            localStorage.setItem(USER_KEY, JSON.stringify(newUser));

                            setAccessToken(newToken);
                            setUser(newUser);
                            api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;

                            originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
                            return api(originalRequest);
                        } catch (refreshError) {
                            // Refresh failed, logout
                            handleLogout();
                        }
                    }
                }
                return Promise.reject(error);
            }
        );

        return () => {
            api.interceptors.response.eject(interceptor);
        };
    }, []);

    const handleLogout = () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setAccessToken(null);
        setUser(null);
        delete api.defaults.headers.common['Authorization'];
    };

    const login = async (email: string, password: string) => {
        const response = await api.post<AuthResponse>('/auth/login', { email, password });
        const { accessToken: token, refreshToken, user: userData } = response.data;

        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
        localStorage.setItem(USER_KEY, JSON.stringify(userData));

        setAccessToken(token);
        setUser(userData);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    };

    const register = async (data: RegisterData) => {
        const response = await api.post<AuthResponse>('/auth/register', data);
        const { accessToken: token, refreshToken, user: userData } = response.data;

        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
        localStorage.setItem(USER_KEY, JSON.stringify(userData));

        setAccessToken(token);
        setUser(userData);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    };

    const logout = async () => {
        try {
            await api.post('/auth/logout');
        } catch (error) {
            // Ignore logout errors
        }
        handleLogout();
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                accessToken,
                isAuthenticated: !!accessToken,
                isLoading,
                login,
                register,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
