import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { ArrowRight, ChevronRight, Plus, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { getEvents, getTenants } from '../lib/api';
import { useNow, useResource } from '../lib/hooks';
import { useEventFeed } from '../lib/feed';
import { STAGES, activeStage, condition, failedStage, isStalled, quietFor } from '../lib/pipeline';
import type { Condition } from '../lib/pipeline';
import { fmtAgo, fmtClock, fmtDuration } from '../lib/time';
import type { Tenant } from '../lib/types';
import type { Tone } from '../lib/ui';
import { TONE_SWATCH, TONE_TEXT } from '../lib/ui';
import { cn } from '../lib/cn';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import Button from '../components/ui/Button';
import Empty from '../components/ui/Empty';
import { ConditionTag } from '../components/ui/Tag';
import Schematic from '../components/pipeline/Schematic';
import type { BoxView } from '../components/pipeline/Schematic';
import SequenceTrack from '../components/pipeline/SequenceTrack';
import Telemetry from '../components/pipeline/Telemetry';
import CreateTenantModal from '../components/CreateTenantModal';
import LoadError from '../components/LoadError';

const ORDER: Condition[] = ['stalled', 'failed', 'running', 'waiting'];

export default function Dashboard() {
    const navigate = useNavigate();
    const now = useNow();
    const reduced = useReducedMotion() ?? false;
    const [createOpen, setCreateOpen] = useState(false);
    const tenants = useResource(getTenants, { interval: 5000 });
    const feed = useEventFeed(getEvents, { interval: 5000 });

    const list = tenants.data ?? [];
    const events = feed.data ?? [];
    const withCond = list.map((t) => ({ t, c: condition(t, now) }));
    const count = (...cs: Condition[]) => withCond.filter((x) => cs.includes(x.c)).length;

    const readouts: { label: string; value: number; tone: Tone }[] = [
        { label: 'Tenants', value: list.length, tone: 'ink' },
        { label: 'Active', value: count('active'), tone: 'go' },
        { label: 'In flight', value: count('running', 'waiting'), tone: 'ignite' },
        { label: 'Stalled', value: count('stalled'), tone: 'hold' },
        { label: 'Failed', value: count('failed'), tone: 'abort' },
        { label: 'Cancelled', value: count('cancelled', 'suspended', 'removing'), tone: 'scrub' },
    ];

    const boxes: BoxView[] = STAGES.map((stage) => {
        const here = list.filter((t) => t.status === 'PROVISIONING' && t[stage.key] === 'IN_PROGRESS');
        const stalled = here.filter((t) => isStalled(t, now)).length;
        const running = here.length - stalled;
        const failed = list.filter((t) => t[stage.key] === 'FAILED').length;
        const done = list.filter((t) => t[stage.key] === 'SUCCESS').length;
        if (stalled) return { tone: 'stall', badge: `${stalled} STALLED`, dlq: true };
        if (running) return { tone: 'run', badge: `${running} IN FLIGHT` };
        if (failed) return { tone: 'fail', badge: `${failed} FAILED`, dlq: true };
        return { tone: done ? 'ok' : 'idle', badge: done ? `${done} DONE` : 'IDLE' };
    });
    const inflight = count('running', 'waiting');
    const attention = count('stalled', 'failed');

    const board = withCond
        .filter((x) => ORDER.includes(x.c))
        .sort((a, b) => ORDER.indexOf(a.c) - ORDER.indexOf(b.c) || Date.parse(b.t.updatedAt) - Date.parse(a.t.updatedAt));
    const recent = list
        .filter((t) => t.status === 'ACTIVE')
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, 4);

    const lastEvent = events[0] ? Date.parse(events[0].timestamp) : undefined;

    return (
        <>
            <CreateTenantModal
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={(t) => {
                    setCreateOpen(false);
                    toast.success(`${t.name} is provisioning`);
                    navigate(`/tenants/${t.id}`);
                }}
            />

            <PageHeader
                sheet="01"
                eyebrow="Overview"
                title="Provisioning control"
                lede={
                    tenants.loading
                        ? 'Reading the board…'
                        : `${list.length} tenant${list.length === 1 ? '' : 's'} on record, ${inflight} in flight${
                              lastEvent ? `, last event ${fmtAgo(lastEvent, now)}` : ''
                          }.`
                }
                actions={
                    <>
                        <Button
                            onClick={() => {
                                tenants.refresh();
                                feed.refresh();
                            }}
                            busy={tenants.refreshing}
                            aria-label="Refresh"
                        >
                            {!tenants.refreshing && <RotateCcw size={14} />}
                            Refresh
                        </Button>
                        <Button variant="primary" onClick={() => setCreateOpen(true)}>
                            <Plus size={15} /> New tenant
                        </Button>
                    </>
                }
            />

            {tenants.error !== null && !tenants.data && (
                <LoadError error={tenants.error} what="tenants" onRetry={tenants.refresh} busy={tenants.refreshing} />
            )}

            <section aria-label="Readouts" className="mb-6 overflow-hidden rounded-md border border-rule bg-card shadow-sheet">
                <dl className="grid grid-cols-2 gap-px bg-rule sm:grid-cols-3 lg:grid-cols-6">
                    {readouts.map((r) => (
                        <div key={r.label} className="bg-card px-4 py-3.5 sm:px-5">
                            <dt className="label flex items-center gap-2">
                                <span className={cn('inline-block h-[7px] w-[7px] rounded-[1px]', TONE_SWATCH[r.tone])} />
                                {r.label}
                            </dt>
                            <dd className={cn('num mt-1.5 font-mono text-[30px] font-medium leading-none', r.value ? TONE_TEXT[r.tone] : 'text-ink-4')}>
                                {tenants.loading ? '—' : r.value}
                            </dd>
                        </div>
                    ))}
                </dl>
                <div className="flex h-1.5 w-full bg-paper-deep" aria-hidden>
                    {list.length > 0 &&
                        readouts.slice(1).map((r) => (
                            <span key={r.label} className={TONE_SWATCH[r.tone]} style={{ width: `${(r.value / list.length) * 100}%` }} />
                        ))}
                </div>
            </section>

            <Panel
                fig="Fig. 1"
                title="Live pipeline"
                meta={
                    feed.updatedAt ? (
                        <span className="flex items-center gap-2">
                            <span className="anim-ring inline-block h-1.5 w-1.5 rounded-full bg-go" />
                            polling every 5 s · {fmtClock(feed.updatedAt)}
                        </span>
                    ) : (
                        'connecting…'
                    )
                }
                actions={
                    attention > 0 ? (
                        <Link to="/failed-jobs" className="inline-flex items-center gap-1.5 font-mono text-[12px] font-medium text-abort hover:underline">
                            {attention} need attention <ArrowRight size={13} />
                        </Link>
                    ) : undefined
                }
                flush
                className="mb-6"
            >
                <div className="scrollbar-thin overflow-x-auto">
                    <div className="min-w-[780px] px-3 pb-1 pt-4 sm:px-5">
                        <Schematic
                            boxes={boxes}
                            core={{
                                tone: inflight ? 'run' : list.length ? 'ok' : 'idle',
                                line: `${inflight} in flight`,
                                sub: `${count('active')} active · sweeper on`,
                            }}
                            dlxNote={attention ? `${attention} tenant${attention === 1 ? '' : 's'} stalled or failed` : undefined}
                            packets={feed.packets}
                            onPacketDone={feed.done}
                            reduced={reduced}
                        />
                    </div>
                </div>
                <Legend />
            </Panel>

            <div className="grid gap-6 lg:grid-cols-12">
                <Panel
                    fig="Fig. 2"
                    title="In sequence"
                    meta={`${board.length} open`}
                    actions={
                        <Link to="/pipeline" className="inline-flex items-center gap-1 text-[13px] font-medium text-blueprint hover:underline">
                            Board <ArrowRight size={13} />
                        </Link>
                    }
                    flush
                    className="lg:col-span-7"
                >
                    {board.length === 0 ? (
                        <Empty
                            title={tenants.loading ? 'Reading the board…' : 'Nothing in flight'}
                            action={
                                !tenants.loading && (
                                    <Button variant="primary" onClick={() => setCreateOpen(true)}>
                                        <Plus size={15} /> Provision a tenant
                                    </Button>
                                )
                            }
                        >
                            {!tenants.loading && 'Provision a tenant and it appears here while its five stages run.'}
                        </Empty>
                    ) : (
                        <ul className="divide-y divide-rule">
                            {board.slice(0, 8).map(({ t, c }) => (
                                <BoardRow key={t.id} tenant={t} cond={c} now={now} />
                            ))}
                        </ul>
                    )}
                    {recent.length > 0 && (
                        <div className="border-t border-rule bg-paper/50 px-4 py-3 sm:px-5">
                            <p className="label mb-2">Recently active</p>
                            <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
                                {recent.map((t) => (
                                    <li key={t.id}>
                                        <Link to={`/tenants/${t.id}`} className="group inline-flex items-center gap-2 text-[13.5px]">
                                            <span className="inline-block h-2 w-2 rounded-full bg-go" />
                                            <span className="font-medium text-ink group-hover:underline">{t.name}</span>
                                            <span className="font-mono text-[11px] text-ink-3">{fmtAgo(Date.parse(t.updatedAt), now)}</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </Panel>

                <Panel
                    fig="Fig. 3"
                    title="Telemetry"
                    meta={`${events.length} latest`}
                    actions={
                        <Link to="/events" className="inline-flex items-center gap-1 text-[13px] font-medium text-blueprint hover:underline">
                            Event log <ArrowRight size={13} />
                        </Link>
                    }
                    flush
                    className="lg:col-span-5"
                >
                    {events.length === 0 ? (
                        <Empty title={feed.loading ? 'Listening…' : 'No events yet'}>
                            {!feed.loading && 'Every hop a tenant makes through the exchange is logged here.'}
                        </Empty>
                    ) : (
                        <Telemetry events={events} freshIds={feed.freshIds} limit={11} />
                    )}
                </Panel>
            </div>
        </>
    );
}

function BoardRow({ tenant, cond, now }: { tenant: Tenant; cond: Condition; now: number }) {
    const stage = activeStage(tenant) ?? failedStage(tenant);
    const quiet = quietFor(tenant, now);
    let detail: string;
    if (cond === 'waiting') detail = `waiting for tenant.requested · ${fmtDuration(quiet)}`;
    else if (cond === 'stalled' && stage) detail = `no progress at ${stage.code} ${stage.short} for ${fmtDuration(quiet)}`;
    else if (cond === 'failed' && stage) detail = `failed at ${stage.code} ${stage.short}`;
    else if (stage) detail = `${stage.code} ${stage.service} · ${fmtDuration(quiet)}`;
    else detail = fmtAgo(Date.parse(tenant.updatedAt), now);

    return (
        <li>
            <Link
                to={`/tenants/${tenant.id}`}
                className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-paper/70 sm:grid-cols-[minmax(0,1.1fr)_auto_minmax(0,1fr)_auto] sm:px-5"
            >
                <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-ink">{tenant.name}</span>
                    <span className="block truncate font-mono text-[11.5px] text-ink-3">{tenant.subdomain}</span>
                </span>
                <SequenceTrack tenant={tenant} now={now} className="hidden sm:block" />
                <span
                    className={cn(
                        'col-span-2 min-w-0 truncate font-mono text-[11.5px] sm:col-span-1',
                        cond === 'stalled' ? 'text-hold' : cond === 'failed' ? 'text-abort' : 'text-ink-2',
                    )}
                >
                    {detail}
                </span>
                <span className="row-start-1 flex items-center gap-2 justify-self-end sm:row-start-auto">
                    <ConditionTag condition={cond} />
                    <ChevronRight size={15} className="text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                </span>
            </Link>
        </li>
    );
}

function Legend() {
    const items: { label: string; cls: string }[] = [
        { label: 'Idle', cls: 'border border-rule-strong bg-card' },
        { label: 'In flight', cls: 'bg-ignite' },
        { label: 'Done', cls: 'bg-ink' },
        { label: 'Stalled', cls: 'bg-hold' },
        { label: 'Failed', cls: 'bg-abort' },
        { label: 'Cancelled', cls: 'hatch border border-scrub/60' },
    ];
    return (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-rule px-4 py-2.5 sm:px-5">
            {items.map((i) => (
                <span key={i.label} className="inline-flex items-center gap-2 font-mono text-[11px] text-ink-3">
                    <span className={cn('inline-block h-2.5 w-2.5 rounded-[1px]', i.cls)} />
                    {i.label}
                </span>
            ))}
            <span className="ml-auto inline-flex items-center gap-2 font-mono text-[11px] text-ink-3">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-ignite" />
                packet = a routing key in transit, replayed in order as events arrive
            </span>
        </div>
    );
}
