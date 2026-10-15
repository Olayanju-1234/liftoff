import { useCallback, useRef, useState } from 'react';
import type { EventLog } from './types';
import type { PacketView } from '../components/pipeline/Schematic';
import { hopForEvent } from './pipeline';
import { hopKey } from './schematic';
import { useResource } from './hooks';

const MAX_REPLAY_DELAY = 8000;
const MIN_REPLAY_GAP = 550;

// Replays newly seen events as packets in order, spaced by their timestamps but never closer than MIN_REPLAY_GAP.
export function useEventFeed(
    fetcher: () => Promise<EventLog[]>,
    options: { interval?: number; key?: string; withTenant?: boolean } = {},
) {
    const { interval, key = '', withTenant = true } = options;
    const seenRef = useRef(new Map<string, Set<string>>());
    const [packets, setPackets] = useState<PacketView[]>([]);
    const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set());

    const resource = useResource(
        async () => {
            const events = await fetcher();
            const seen = seenRef.current.get(key);
            if (!seen) {
                seenRef.current.set(key, new Set(events.map((e) => e.id)));
                return events;
            }
            const fresh = events.filter((e) => !seen.has(e.id));
            if (!fresh.length) return events;
            fresh.forEach((e) => seen.add(e.id));
            const ordered = [...fresh].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
            const t0 = Date.parse(ordered[0].timestamp);
            const next: PacketView[] = [];
            let lastDelay = -MIN_REPLAY_GAP;
            for (const e of ordered) {
                const hop = hopForEvent(e.eventType);
                if (hop === undefined || e.status === 'Error') continue;
                const who = withTenant ? e.tenant?.subdomain ?? e.tenant?.name : undefined;
                const delay = Math.min(Math.max(Date.parse(e.timestamp) - t0, lastDelay + MIN_REPLAY_GAP), MAX_REPLAY_DELAY);
                lastDelay = delay;
                next.push({ id: e.id, hop, label: who ? `${who} · ${hopKey(hop)}` : hopKey(hop), delay });
            }
            setPackets((prev) => [...prev, ...next].slice(-14));
            setFreshIds(new Set(fresh.map((e) => e.id)));
            return events;
        },
        { interval, key },
    );

    const done = useCallback((id: string) => {
        setPackets((prev) => prev.filter((p) => p.id !== id));
    }, []);

    return { ...resource, packets, done, freshIds };
}
