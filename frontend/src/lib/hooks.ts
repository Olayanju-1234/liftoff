import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

export interface Resource<T> {
    data: T | undefined;
    error: unknown;
    loading: boolean;
    refreshing: boolean;
    updatedAt: number | null;
    refresh: () => void;
}

interface ResourceState<T> {
    data?: T;
    error: unknown;
    loading: boolean;
    updatedAt: number | null;
}

// Polls only while the tab is visible; the gateway allows 100 requests a minute per IP.
export function useResource<T>(
    fetcher: () => Promise<T>,
    options: { interval?: number; key?: string } = {},
): Resource<T> {
    const { interval, key = '' } = options;
    const fetcherRef = useRef(fetcher);
    useEffect(() => {
        fetcherRef.current = fetcher;
    });

    const [state, setState] = useState<ResourceState<T>>({ error: null, loading: true, updatedAt: null });
    const [nonce, setNonce] = useState(0);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        let alive = true;
        const run = async () => {
            try {
                const data = await fetcherRef.current();
                if (alive) setState({ data, error: null, loading: false, updatedAt: Date.now() });
            } catch (error) {
                if (alive) setState((prev) => ({ ...prev, error, loading: false }));
            } finally {
                if (alive) setRefreshing(false);
            }
        };
        void run();
        if (!interval) {
            return () => {
                alive = false;
            };
        }
        const id = window.setInterval(() => {
            if (document.visibilityState === 'visible') void run();
        }, interval);
        return () => {
            alive = false;
            window.clearInterval(id);
        };
    }, [interval, key, nonce]);

    const refresh = useCallback(() => {
        setRefreshing(true);
        setNonce((n) => n + 1);
    }, []);

    return { data: state.data, error: state.error, loading: state.loading, updatedAt: state.updatedAt, refreshing, refresh };
}

let nowValue = Date.now();
const nowListeners = new Set<() => void>();
let nowTimer: number | undefined;

function subscribeNow(listener: () => void) {
    nowListeners.add(listener);
    if (nowTimer === undefined) {
        nowValue = Date.now();
        nowTimer = window.setInterval(() => {
            nowValue = Date.now();
            nowListeners.forEach((l) => l());
        }, 1000);
    }
    return () => {
        nowListeners.delete(listener);
        if (!nowListeners.size && nowTimer !== undefined) {
            window.clearInterval(nowTimer);
            nowTimer = undefined;
        }
    };
}

export function useNow(): number {
    return useSyncExternalStore(subscribeNow, () => nowValue);
}
