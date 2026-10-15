import { Link } from 'react-router-dom';
import type { EventLog } from '../../lib/types';
import { eventErrorText, eventLabel, stageForEvent } from '../../lib/pipeline';
import { EVENT_TONE } from '../../lib/ui';
import { fmtClock } from '../../lib/time';
import { cn } from '../../lib/cn';
import { Swatch } from '../ui/Tag';

interface TelemetryProps {
    events: EventLog[];
    freshIds?: ReadonlySet<string>;
    limit?: number;
    showTenant?: boolean;
}

export default function Telemetry({ events, freshIds, limit = 14, showTenant = true }: TelemetryProps) {
    return (
        <ol className="divide-y divide-rule/70">
            {events.slice(0, limit).map((e) => {
                const stage = stageForEvent(e.eventType);
                const err = eventErrorText(e);
                const tone = EVENT_TONE[e.status] ?? 'scrub';
                return (
                    <li
                        key={e.id}
                        className={cn(
                            'grid grid-cols-[62px_minmax(0,1fr)] items-baseline gap-x-3 px-4 py-2 sm:px-5',
                            freshIds?.has(e.id) && 'anim-row-in',
                        )}
                    >
                        <span className="num font-mono text-[11.5px] text-ink-3">{fmtClock(Date.parse(e.timestamp))}</span>
                        <span className="min-w-0">
                            <span className="flex items-center gap-2">
                                <Swatch tone={tone} />
                                <span className="truncate font-mono text-[12.5px] font-medium text-ink">{e.eventType}</span>
                                {stage && <span className="font-mark text-[8.5px] tracking-[0.1em] text-ink-3">{stage.code}</span>}
                            </span>
                            <span className="block truncate pl-[15px] text-[13px] text-ink-3">
                                {showTenant && (
                                    <>
                                        <Link to={`/tenants/${e.tenantId}`} className="text-ink-2 hover:text-ink hover:underline">
                                            {e.tenant?.name ?? e.tenantId.slice(0, 8)}
                                        </Link>
                                        {' · '}
                                    </>
                                )}
                                <span className={err ? 'text-abort' : undefined}>{err ?? eventLabel(e.eventType)}</span>
                            </span>
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}
