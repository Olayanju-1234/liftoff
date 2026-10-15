import { format } from 'date-fns';

export function fmtDuration(ms: number): string {
    const v = Math.max(0, ms);
    if (v < 1000) return `${Math.round(v)} ms`;
    if (v < 10_000) return `${(v / 1000).toFixed(2)} s`;
    if (v < 60_000) return `${(v / 1000).toFixed(1)} s`;
    const totalMin = Math.floor(v / 60_000);
    const sec = Math.floor((v % 60_000) / 1000);
    if (totalMin < 60) return `${totalMin}m ${String(sec).padStart(2, '0')}s`;
    const hours = Math.floor(totalMin / 60);
    if (hours < 48) return `${hours}h ${String(totalMin % 60).padStart(2, '0')}m`;
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function fmtOffset(ms: number): string {
    const v = Math.max(0, ms);
    if (v < 60_000) return `T+${(v / 1000).toFixed(2)}s`;
    return `T+${fmtDuration(v).replace(' ', '')}`;
}

export function fmtAgo(ts: number, now: number): string {
    const d = now - ts;
    if (d < 5_000) return 'just now';
    if (d < 60_000) return `${Math.floor(d / 1000)}s ago`;
    if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
    if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
    if (d < 7 * 86_400_000) return `${Math.floor(d / 86_400_000)}d ago`;
    return format(ts, 'd MMM yyyy');
}

export const fmtClock = (ts: number) => format(ts, 'HH:mm:ss');
export const fmtStamp = (ts: number) => format(ts, 'd MMM yyyy, HH:mm:ss');
export const fmtDate = (ts: number) => format(ts, 'd MMM yyyy');
