import { STAGES, stageState } from '../../lib/pipeline';
import type { StageState, Timeline } from '../../lib/pipeline';
import type { Tenant } from '../../lib/types';
import { fmtDuration, fmtOffset } from '../../lib/time';
import { STAGE_STATE_META, TONE_TEXT } from '../../lib/ui';
import { cn } from '../../lib/cn';

interface StageTimelineProps {
    tenant: Tenant;
    timeline: Timeline;
    now: number;
}

const BAR: Record<StageState, string> = {
    PENDING: '',
    IN_PROGRESS: 'anim-flow',
    STALLED: 'bg-hold',
    SUCCESS: 'bg-ink',
    FAILED: 'bg-abort',
    CANCELLED: 'hatch border border-scrub/60',
    SKIPPED: 'border border-dashed border-ink/50',
};

export default function StageTimeline({ tenant, timeline, now }: StageTimelineProps) {
    const { t0, stages, completeAt } = timeline;
    const ends = stages.map((s, i) => {
        if (s.end !== undefined) return s.end;
        const st = stageState(tenant, STAGES[i], now);
        if ((st === 'IN_PROGRESS' || st === 'STALLED') && s.start !== undefined) return now;
        return undefined;
    });
    const last = Math.max(completeAt ?? 0, ...ends.map((e) => e ?? 0), t0 + 1000);
    const span = last - t0;
    const pct = (ts: number) => `${Math.min(100, Math.max(0, ((ts - t0) / span) * 100))}%`;
    const ticks = [0, 0.25, 0.5, 0.75, 1];

    return (
        <div>
            <div className="grid grid-cols-[132px_minmax(0,1fr)_72px] gap-x-4 sm:grid-cols-[168px_minmax(0,1fr)_84px]">
                <span />
                <div className="relative mb-2 h-4">
                    {ticks.map((f) => (
                        <span
                            key={f}
                            className="num absolute top-0 -translate-x-1/2 font-mono text-[10px] text-ink-3 first:translate-x-0 last:-translate-x-full"
                            style={{ left: `${f * 100}%` }}
                        >
                            {fmtOffset(span * f)}
                        </span>
                    ))}
                </div>
                <span className="label mb-2 text-right">Took</span>

                {stages.map((s, i) => {
                    const state = stageState(tenant, s.stage, now);
                    const end = ends[i];
                    const hasBar = s.start !== undefined && end !== undefined;
                    return (
                        <div key={s.stage.key} className="contents">
                            <div className="flex items-center gap-2.5 border-t border-rule py-2.5">
                                <span className="font-mark text-[9px] tracking-[0.1em] text-ink-3">{s.stage.code}</span>
                                <span className="truncate font-mono text-[12.5px] text-ink">{s.stage.service}</span>
                            </div>
                            <div className="relative border-t border-rule py-2.5">
                                <div className="relative h-3.5 rounded-[1px] bg-paper-deep/70">
                                    {ticks.slice(1, -1).map((f) => (
                                        <span key={f} className="absolute inset-y-0 w-px bg-rule" style={{ left: `${f * 100}%` }} />
                                    ))}
                                    {hasBar && (
                                        <span
                                            className={cn('absolute inset-y-0 min-w-[3px] rounded-[1px]', BAR[state])}
                                            style={{ left: pct(s.start!), width: `calc(${pct(end!)} - ${pct(s.start!)})` }}
                                            title={`${s.stage.name}: ${STAGE_STATE_META[state].label}`}
                                        />
                                    )}
                                </div>
                            </div>
                            <div
                                className={cn(
                                    'num border-t border-rule py-2.5 text-right font-mono text-[12px]',
                                    hasBar ? TONE_TEXT[STAGE_STATE_META[state].tone] : 'text-ink-4',
                                )}
                            >
                                {hasBar ? fmtDuration(end! - s.start!) : STAGE_STATE_META[state].label.toLowerCase()}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="mt-1 flex flex-wrap justify-between gap-2 border-t border-ink/70 pt-2.5 font-mono text-[12px]">
                <span className="text-ink-3">T+0 = tenant.created</span>
                <span className="text-ink">
                    {completeAt ? (
                        <>
                            signup to ACTIVE in <span className="font-medium text-go">{fmtDuration(completeAt - t0)}</span>
                        </>
                    ) : tenant.status === 'PROVISIONING' ? (
                        <>elapsed {fmtDuration(span)}</>
                    ) : (
                        <>last stage finished at {fmtOffset(span)}</>
                    )}
                </span>
            </div>
        </div>
    );
}
