import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { eventErrorText, eventLabel, stageForEvent } from '../../lib/pipeline';
import { fmtOffset, fmtStamp } from '../../lib/time';
import { EVENT_TONE } from '../../lib/ui';
import { cn } from '../../lib/cn';
import type { EventLog } from '../../lib/types';
import { Swatch } from '../ui/Tag';
import PayloadView from '../PayloadView';

export default function EventTimeline({ events, t0, freshIds }: { events: EventLog[]; t0: number; freshIds: ReadonlySet<string> }) {
    const [open, setOpen] = useState<string | null>(null);
    const ordered = [...events].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    return (
        <ol className="relative py-2">
            <span aria-hidden className="absolute bottom-5 left-[21px] top-5 w-px bg-rule-strong sm:left-[25px]" />
            {ordered.map((e) => {
                const ts = Date.parse(e.timestamp);
                const stage = stageForEvent(e.eventType);
                const err = eventErrorText(e);
                const isOpen = open === e.id;
                return (
                    <li key={e.id} className={cn('relative px-4 sm:px-5', freshIds.has(e.id) && 'anim-row-in')}>
                        <button
                            type="button"
                            aria-expanded={isOpen}
                            onClick={() => setOpen(isOpen ? null : e.id)}
                            className="group flex w-full items-start gap-3 py-2 text-left"
                        >
                            <span className="relative z-10 mt-[5px] inline-flex h-[11px] w-[11px] shrink-0 items-center justify-center rounded-[2px] border border-card bg-card">
                                <Swatch tone={EVENT_TONE[e.status] ?? 'scrub'} className="h-[9px] w-[9px]" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-baseline gap-x-2">
                                    <span className="font-mono text-[12.5px] font-medium text-ink">{e.eventType}</span>
                                    {stage && <span className="font-mark text-[8.5px] tracking-[0.1em] text-ink-3">{stage.code}</span>}
                                    <span className="num ml-auto font-mono text-[11px] text-ink-3" title={fmtStamp(ts)}>
                                        {fmtOffset(ts - t0)}
                                    </span>
                                </span>
                                <span className={cn('block text-[13px]', err ? 'text-abort' : 'text-ink-3')}>{err ?? eventLabel(e.eventType)}</span>
                            </span>
                            <ChevronRight
                                size={14}
                                className={cn('mt-1 shrink-0 text-ink-4 transition-transform group-hover:text-ink', isOpen && 'rotate-90')}
                            />
                        </button>
                        {isOpen && <PayloadView payload={e.payload} className="mb-3 ml-[23px]" />}
                    </li>
                );
            })}
        </ol>
    );
}
