import { useSyncExternalStore } from 'react';

export type ViewMode = 'engineering' | 'simple';

const KEY = 'liftoff.view';

function readStored(): ViewMode {
    try {
        return localStorage.getItem(KEY) === 'simple' ? 'simple' : 'engineering';
    } catch {
        return 'engineering';
    }
}

let current: ViewMode = readStored();
const listeners = new Set<() => void>();

export const viewModeStore = {
    get: (): ViewMode => current,
    set(next: ViewMode) {
        current = next;
        try {
            localStorage.setItem(KEY, next);
        } catch {
            // Storage can be unavailable (private mode); the in-memory choice still applies.
        }
        listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
};

export function useViewMode(): ViewMode {
    return useSyncExternalStore(viewModeStore.subscribe, viewModeStore.get);
}

export function useIsSimple(): boolean {
    return useViewMode() === 'simple';
}
