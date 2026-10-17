import { useLocation } from 'react-router-dom';

// Simple is the product; the engineering pages live "under the hood" at their existing routes.
export const HOOD_HOME = '/under-the-hood';

const HOOD_PREFIXES = [HOOD_HOME, '/tenants', '/pipeline', '/events', '/failed-jobs', '/health'];

export function isHoodPath(pathname: string): boolean {
    return HOOD_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function useIsSimple(): boolean {
    return !isHoodPath(useLocation().pathname);
}
