import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Ban, ChevronRight, RotateCcw } from 'lucide-react';
import { getEvents, getTenants } from '../lib/api';
import { useNow, useResource } from '../lib/hooks';
import { useTenantActions } from '../lib/useTenantActions';
import {
    DLX,
    activeStage,
    cancelReasonFrom,
    condition,
    eventErrorText,
    failedStage,
    isSweeperCancel,
    quietFor,
    sweepAt,
} from '../lib/pipeline';
import { fmtAgo, fmtDuration, fmtStamp } from '../lib/time';
import type { Tone } from '../lib/ui';
import { TONE_TEXT } from '../lib/ui';
import { cn } from '../lib/cn';
import type { Tenant } from '../lib/types';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import Button from '../components/ui/Button';
import { Swatch } from '../components/ui/Tag';
import SequenceTrack from '../components/pipeline/SequenceTrack';
import PayloadView from '../components/PayloadView';
import LoadError from '../components/LoadError';

export default function FailedJobs() {
    const now = useNow();
    const tenants = useResource(getTenants, { interval: 10_000 });
    const events = useResource(getEvents, { interval: 15_000 });
    const actions = useTenantActions({ onCancelled: tenants.refresh, onDeleted: tenants.refresh });
    const [open, setOpen] = useState<string | null>(null);

    const list = tenants.data ?? [];
    const stalled = list.filter((t) => condition(t, now) === 'stalled').sort((a, b) => quietFor(b, now) - quietFor(a, now));
    const failed = list.filter((t) => condition(t, now) === 'failed');
    const errors = (events.data ?? []).filter((e) => e.status === 'Error');
    const cancelled = list
        .filter((t) => t.status === 'CANCELLED')
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, 12);

    const summary: { label: string; value: number; tone: Tone; href: string }[] = [
        { label: 'Stalled', value: stalled.length, tone: 'hold', href: '#stalled' },
        { label: 'Failed', value: failed.length, tone: 'abort', href: '#failed' },
        { label: 'Error events', value: errors.length, tone: 'abort', href: '#errors' },
        { label: 'Cancelled', value: list.filter((t) => t.status === 'CANCELLED').length, tone: 'scrub', href: '#cancelled' },
    ];
    const clear = stalled.length + failed.length + errors.length === 0;

    return (
        <>
            {actions.dialog}
            <PageHeader
                sheet="05"
                eyebrow="Dead letters"
                title="Dead letters"
                lede={
                    <>
                        Where provisioning stopped. A worker that can't finish rejects its message without requeue, so RabbitMQ
                        dead-letters it to <code className="font-mono text-[14px] text-ink">{DLX}</code> and the step never completes.
                        This page finds those tenants from their state and the event log.
                    </>
                }
                actions={
                    <Button
                        onClick={() => {
                            tenants.refresh();
                            events.refresh();
                        }}
                        busy={tenants.refreshing}
                    >
                        {!tenants.refreshing && <RotateCcw size={14} />} Refresh
                    </Button>
                }
            />

            {tenants.error !== null && !tenants.data && (
                <LoadError error={tenants.error} what="tenants" onRetry={tenants.refresh} busy={tenants.refreshing} />
            )}

            <div className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-rule bg-rule shadow-sheet md:grid-cols-4">
                {summary.map((s) => (
                    <a key={s.label} href={s.href} className="group bg-card px-5 py-4 transition-colors hover:bg-paper">
                        <p className="label flex items-center gap-2">
                            <Swatch tone={s.tone} />
                            {s.label}
                        </p>
                        <p className={cn('num mt-1.5 font-mono text-[30px] font-medium leading-none', s.value ? TONE_TEXT[s.tone] : 'text-ink-4')}>
                            {tenants.loading ? '—' : s.value}
                        </p>
                    </a>
                ))}
            </div>

            {clear && !tenants.loading && (
                <div className="mb-8 flex items-center gap-3 rounded-md border border-go/35 bg-go/[0.05] px-4 py-3 text-[14.5px]">
                    <Swatch tone="go" />
                    <span className="font-semibold text-ink">Nothing is stuck.</span>
                    <span className="text-ink-2">Every open tenant has moved within the last minute.</span>
                </div>
            )}

            <Section id="stalled" fig="5.1" title="Stalled" count={stalled.length} note="No progress for over a minute; the message was most likely dead-lettered.">
                {stalled.length === 0 ? (
                    <Quiet>No stalled stages.</Quiet>
                ) : (
                    <ul className="divide-y divide-rule">
                        {stalled.map((t) => {
                            const stage = activeStage(t)!;
                            const sweepIn = sweepAt(t) - now;
                            return (
                                <li key={t.id} className="grid gap-x-5 gap-y-2 px-4 py-3.5 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] lg:items-center">
                                    <TenantCell tenant={t} now={now} />
                                    <div className="min-w-0 font-mono text-[12px] leading-relaxed">
                                        <p className="text-ink">
                                            <span className="font-mark text-[9px] tracking-[0.1em] text-ink-3">{stage.code}</span> {stage.service}
                                            <span className="text-ink-3"> · {stage.queue}</span>
                                        </p>
                                        <p className="text-hold">
                                            quiet {fmtDuration(quietFor(t, now))} · likely {DLX} [{stage.deadLetterKey}]
                                        </p>
                                        <p className="text-ink-3">sweeper cancels {sweepIn > 0 ? `in ~${fmtDuration(sweepIn)}` : 'on its next run'}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="sm" onClick={() => actions.requestCancel(t)}>
                                            <Ban size={13} /> Cancel now
                                        </Button>
                                        <OpenLink id={t.id} />
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Section>

            <Section id="failed" fig="5.2" title="Failed" count={failed.length} note="A step reported FAILED, or the tenant was marked FAILED.">
                {failed.length === 0 ? (
                    <Quiet>No failed tenants.</Quiet>
                ) : (
                    <ul className="divide-y divide-rule">
                        {failed.map((t) => {
                            const stage = failedStage(t);
                            return (
                                <li key={t.id} className="grid gap-x-5 gap-y-2 px-4 py-3.5 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] lg:items-center">
                                    <TenantCell tenant={t} now={now} />
                                    <p className="font-mono text-[12px] text-abort">
                                        {stage ? `${stage.code} ${stage.service} failed · ${stage.deadLetterKey}` : 'tenant marked FAILED'}
                                    </p>
                                    <OpenLink id={t.id} />
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Section>

            <Section id="errors" fig="5.3" title="Error events" count={errors.length} note="Events tenant-service logged with status Error, from the latest 200.">
                {events.loading ? (
                    <Quiet>Reading events…</Quiet>
                ) : errors.length === 0 ? (
                    <Quiet>No error events.</Quiet>
                ) : (
                    <ul className="divide-y divide-rule">
                        {errors.map((e) => (
                            <li key={e.id} className="px-4 py-3 sm:px-5">
                                <button
                                    type="button"
                                    aria-expanded={open === e.id}
                                    onClick={() => setOpen(open === e.id ? null : e.id)}
                                    className="flex w-full items-start gap-3 text-left"
                                >
                                    <Swatch tone="abort" className="mt-[7px]" />
                                    <span className="min-w-0 flex-1">
                                        <span className="flex flex-wrap items-baseline gap-x-3">
                                            <span className="font-mono text-[13px] font-medium text-ink">{e.eventType}</span>
                                            <span className="text-[13.5px] text-ink-2">{e.tenant?.name ?? e.tenantId.slice(0, 8)}</span>
                                            <span className="ml-auto font-mono text-[11.5px] text-ink-3" title={fmtStamp(Date.parse(e.timestamp))}>
                                                {fmtAgo(Date.parse(e.timestamp), now)}
                                            </span>
                                        </span>
                                        <span className="block font-mono text-[12px] text-abort">{eventErrorText(e) ?? 'No error message in the payload.'}</span>
                                    </span>
                                    <ChevronRight size={14} className={cn('mt-1 text-ink-4 transition-transform', open === e.id && 'rotate-90')} />
                                </button>
                                {open === e.id && <PayloadView payload={e.payload} className="ml-5 mt-3" />}
                            </li>
                        ))}
                    </ul>
                )}
            </Section>

            <Section id="cancelled" fig="5.4" title="Cancelled" count={cancelled.length} note="Most recent first. Sweeper cancellations carry a timeout reason.">
                {cancelled.length === 0 ? (
                    <Quiet>No cancelled tenants.</Quiet>
                ) : (
                    <ul className="divide-y divide-rule">
                        {cancelled.map((t) => {
                            const reason = cancelReasonFrom(t);
                            const sweeper = isSweeperCancel(reason);
                            return (
                                <li key={t.id} className="grid gap-x-5 gap-y-2 px-4 py-3 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] lg:items-center">
                                    <TenantCell tenant={t} now={now} />
                                    <p className="font-mono text-[12px]">
                                        <span className={sweeper ? 'text-hold' : 'text-ink-2'}>{sweeper ? 'timeout sweeper' : 'operator'}</span>
                                        {reason && <span className="text-ink-3"> · “{reason}”</span>}
                                    </p>
                                    <OpenLink id={t.id} />
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Section>

            <aside className="mt-8 rounded-md border border-dashed border-rule-strong bg-card/70 px-5 py-4 text-[14px] leading-relaxed text-ink-2">
                <p className="label mb-1.5">Note</p>
                Replaying a dead-lettered message isn't exposed through the API, and this codebase doesn't bind a queue to{' '}
                <code className="font-mono text-[13px] text-ink">{DLX}</code>, so the broker only keeps those messages if you bind one
                yourself. Until then, the tenant state above is the record of what failed. Cancel a stalled tenant here, or let the sweeper
                do it after 30 minutes.
            </aside>
        </>
    );
}

function Section({ id, fig, title, count, note, children }: { id: string; fig: string; title: string; count: number; note: string; children: ReactNode }) {
    return (
        <Panel
            id={id}
            fig={`Fig. ${fig}`}
            title={
                <span className="inline-flex items-baseline gap-2">
                    {title}
                    <span className="num font-mono text-[13px] font-normal text-ink-3">{count}</span>
                </span>
            }
            meta={note}
            flush
            className="mb-6 scroll-mt-16"
        >
            {children}
        </Panel>
    );
}

function Quiet({ children }: { children: ReactNode }) {
    return <p className="px-5 py-5 font-mono text-[12px] text-ink-3">{children}</p>;
}

function TenantCell({ tenant, now }: { tenant: Tenant; now: number }) {
    return (
        <div className="flex min-w-0 items-center gap-4">
            <div className="min-w-0 flex-1">
                <Link to={`/tenants/${tenant.id}`} className="block truncate text-[15px] font-semibold text-ink hover:underline">
                    {tenant.name}
                </Link>
                <p className="truncate font-mono text-[11.5px] text-ink-3">{tenant.subdomain}</p>
            </div>
            <SequenceTrack tenant={tenant} now={now} className="shrink-0" />
        </div>
    );
}

function OpenLink({ id }: { id: string }) {
    return (
        <Link to={`/tenants/${id}`} className="inline-flex h-8 items-center gap-1 justify-self-start rounded px-2 text-[13px] font-medium text-blueprint hover:bg-blueprint/[0.06] lg:justify-self-end">
            Open <ArrowRight size={13} />
        </Link>
    );
}
