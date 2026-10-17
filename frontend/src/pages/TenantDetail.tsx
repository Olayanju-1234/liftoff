import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { isAxiosError } from 'axios';
import { ArrowLeft, Ban, Check, ChevronRight, Copy, Trash2 } from 'lucide-react';
import { getTenant, getTenantEvents } from '../lib/api';
import { useNow, useResource } from '../lib/hooks';
import { useEventFeed } from '../lib/feed';
import { useTenantActions } from '../lib/useTenantActions';
import {
    DLX,
    STAGES,
    STEP_TIMEOUT_MS,
    SWEEP_AFTER_MS,
    activeStage,
    billingSkip,
    cancelReasonFrom,
    condition,
    eventErrorText,
    eventLabel,
    failedStage,
    isStepTimeout,
    isSweeperCancel,
    planLabel,
    quietFor,
    schemaName,
    stageForEvent,
    stageState,
    stageTimings,
    stepTimeoutAt,
    sweepAt,
} from '../lib/pipeline';
import type { Condition } from '../lib/pipeline';
import { tenantHost } from '../lib/simple';
import { fmtAgo, fmtClock, fmtDuration, fmtOffset, fmtStamp } from '../lib/time';
import { EVENT_TONE } from '../lib/ui';
import type { Tone } from '../lib/ui';
import { cn } from '../lib/cn';
import type { EventLog, Tenant } from '../lib/types';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import Button from '../components/ui/Button';
import Empty from '../components/ui/Empty';
import { ConditionTag, Swatch, Tag } from '../components/ui/Tag';
import Schematic from '../components/pipeline/Schematic';
import type { BoxView, CoreView } from '../components/pipeline/Schematic';
import StageTimeline from '../components/pipeline/StageTimeline';
import SequenceTrack from '../components/pipeline/SequenceTrack';
import PayloadView from '../components/PayloadView';
import LoadError from '../components/LoadError';

export default function TenantDetail() {
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const now = useNow();
    const reduced = useReducedMotion() ?? false;
    const [live, setLive] = useState(true);
    const interval = live ? 3000 : 20_000;

    const tenantRes = useResource(
        async () => {
            const t = await getTenant(id);
            setLive(t.status === 'PROVISIONING');
            return t;
        },
        { interval, key: id },
    );
    const feed = useEventFeed(() => getTenantEvents(id), { interval, key: id, withTenant: false });
    const actions = useTenantActions({
        onCancelled: () => {
            tenantRes.refresh();
            feed.refresh();
        },
        onDeleted: () => navigate('/tenants'),
    });

    const tenant = tenantRes.data;
    const events = feed.data ?? [];

    if (!tenant) {
        const missing = isAxiosError(tenantRes.error) && [400, 404].includes(tenantRes.error.response?.status ?? 0);
        return (
            <>
                <BackLink />
                {tenantRes.loading ? (
                    <div className="h-64 animate-pulse rounded-md border border-rule bg-card/60" />
                ) : missing ? (
                    <Panel>
                        <Empty title="No tenant with that ID" action={<BackLink inline />}>
                            It may have been deleted. Deleting a tenant removes its event history too.
                        </Empty>
                    </Panel>
                ) : (
                    <LoadError error={tenantRes.error} what="this tenant" onRetry={tenantRes.refresh} busy={tenantRes.refreshing} />
                )}
            </>
        );
    }

    const cond = condition(tenant, now);
    const timeline = stageTimings(tenant, events);
    const boxes = buildBoxes(tenant, timeline, now);
    const core: CoreView = {
        tone: CORE_TONE[cond],
        line: tenant.status,
        sub: tenant.subdomain,
    };

    return (
        <>
            {actions.dialog}
            <BackLink />
            <PageHeader
                sheet="02.1"
                eyebrow={`Tenant · ${tenant.subdomain}`}
                title={tenant.name}
                aside={
                    <div className="flex flex-wrap items-center gap-3">
                        <ConditionTag condition={cond} />
                        {tenant.isTest && (
                            <Tag tone="blueprint" title="Test tenant: billing SKIPPED, outside the quotas, deletable any time.">
                                Test
                            </Tag>
                        )}
                        <SequenceTrack tenant={tenant} now={now} size="md" labels />
                        {live && (
                            <span className="font-mono text-[11px] text-ink-3">
                                watching · refreshes every 3 s{tenantRes.updatedAt ? ` · ${fmtClock(tenantRes.updatedAt)}` : ''}
                            </span>
                        )}
                    </div>
                }
                actions={
                    <>
                        {tenant.status === 'PROVISIONING' && (
                            <Button onClick={() => actions.requestCancel(tenant)}>
                                <Ban size={14} /> Cancel provisioning
                            </Button>
                        )}
                        <Button variant="danger" onClick={() => actions.requestDelete(tenant)}>
                            <Trash2 size={14} /> Delete
                        </Button>
                    </>
                }
            />

            <TitleBlock tenant={tenant} now={now} />
            <StatusNote tenant={tenant} cond={cond} events={events} now={now} />

            <Panel fig="Fig. 1" title="Where this tenant is" meta="the same wiring as the overview, scoped to one tenant" flush className="mb-6">
                <div className="scrollbar-thin overflow-x-auto">
                    <div className="min-w-[780px] px-3 pb-2 pt-4 sm:px-5">
                        <Schematic
                            boxes={boxes}
                            core={core}
                            packets={feed.packets}
                            onPacketDone={feed.done}
                            reduced={reduced}
                            dlxNote={boxes.some((b) => b.dlq) ? 'message likely dead-lettered' : undefined}
                        />
                    </div>
                </div>
            </Panel>

            <div className="grid gap-6 xl:grid-cols-12">
                <Panel fig="Fig. 2" title="Stage timings" meta="from the event log" className="xl:col-span-7">
                    <StageTimeline tenant={tenant} timeline={timeline} now={now} />
                </Panel>
                <Panel fig="Fig. 3" title="Event log" meta={`${events.length} events`} flush className="xl:col-span-5">
                    {events.length === 0 ? (
                        <Empty title={feed.loading ? 'Reading events…' : 'No events recorded'} />
                    ) : (
                        <EventTimeline events={events} t0={timeline.t0} freshIds={feed.freshIds} />
                    )}
                </Panel>
            </div>
        </>
    );
}

const CORE_TONE: Record<Condition, CoreView['tone']> = {
    active: 'go',
    running: 'run',
    stalled: 'stall',
    waiting: 'idle',
    failed: 'fail',
    cancelled: 'cancel',
    suspended: 'cancel',
};

function buildBoxes(tenant: Tenant, timeline: ReturnType<typeof stageTimings>, now: number): BoxView[] {
    return STAGES.map((stage, i) => {
        const state = stageState(tenant, stage, now);
        const { start, end } = timeline.stages[i];
        switch (state) {
            case 'SUCCESS':
                return { tone: 'ok', badge: 'DONE', meta: start !== undefined && end !== undefined ? fmtDuration(end - start) : undefined };
            case 'IN_PROGRESS':
                return { tone: 'run', badge: 'IN FLIGHT', meta: start !== undefined ? fmtDuration(now - start) : undefined };
            case 'STALLED':
                return { tone: 'stall', badge: 'STALLED', meta: fmtDuration(quietFor(tenant, now)), dlq: true };
            case 'FAILED':
                return { tone: 'fail', badge: 'FAILED', dlq: true };
            case 'CANCELLED':
                return { tone: 'cancel', badge: 'CANCELLED' };
            case 'SKIPPED':
                return { tone: 'idle', badge: 'SKIPPED', meta: billingSkip(tenant) === 'test' ? 'test tenant' : 'Stripe not connected' };
            default:
                return { tone: 'idle', badge: 'PENDING' };
        }
    });
}

function BackLink({ inline = false }: { inline?: boolean }) {
    return (
        <Link
            to="/tenants"
            className={cn('inline-flex items-center gap-1.5 text-[13.5px] font-medium text-ink-3 hover:text-ink', !inline && 'mb-4')}
        >
            <ArrowLeft size={14} /> All tenants
        </Link>
    );
}

function TitleBlock({ tenant, now }: { tenant: Tenant; now: number }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(tenant.id);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    };
    const cells: { k: string; v: ReactNode; title?: string }[] = [
        {
            k: 'Tenant ID',
            v: (
                <button type="button" onClick={copy} className="group inline-flex max-w-full items-center gap-1.5 text-left" title="Copy ID">
                    <span className="truncate">{tenant.id}</span>
                    {copied ? <Check size={12} className="shrink-0 text-go" /> : <Copy size={12} className="shrink-0 text-ink-4 group-hover:text-ink" />}
                </button>
            ),
        },
        { k: 'Address', v: tenantHost(tenant), title: `${tenantHost(tenant)} (DNS is simulated; display only)` },
        { k: 'Schema', v: tenant.schemaName ?? schemaName(tenant.subdomain), title: tenant.schemaName ?? schemaName(tenant.subdomain) },
        { k: 'Plan', v: planLabel(tenant), title: `planId ${tenant.planId}` },
        {
            k: 'Billing',
            v: tenant.stripeSubscriptionId ?? (billingSkip(tenant) === 'not-connected' ? 'not connected' : billingSkip(tenant) === 'test' ? 'skipped (test)' : '—'),
            title: tenant.stripeSubscriptionId
                ? `Stripe subscription ${tenant.stripeSubscriptionId} (customer ${tenant.stripeCustomerId ?? '?'})`
                : 'No Stripe subscription for this tenant',
        },
        { k: 'Created', v: fmtAgo(Date.parse(tenant.createdAt), now), title: fmtStamp(Date.parse(tenant.createdAt)) },
        { k: 'Last change', v: fmtAgo(Date.parse(tenant.updatedAt), now), title: fmtStamp(Date.parse(tenant.updatedAt)) },
    ];
    return (
        <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-ink/70 bg-rule md:grid-cols-4 xl:grid-cols-7">
            {cells.map((c, i) => (
                // Seven cells: the last one fills the row on the 2- and 4-column layouts.
                <div key={c.k} className={cn('min-w-0 bg-card px-4 py-3', i === cells.length - 1 && 'col-span-2 xl:col-span-1')} title={c.title}>
                    <dt className="label mb-1">{c.k}</dt>
                    <dd className="truncate font-mono text-[13px] text-ink">{c.v}</dd>
                </div>
            ))}
        </dl>
    );
}

function StatusNote({ tenant, cond, events, now }: { tenant: Tenant; cond: Condition; events: EventLog[]; now: number }) {
    let tone: Tone = 'ink';
    let head = '';
    let body: ReactNode = null;
    const stage = activeStage(tenant) ?? failedStage(tenant);
    const sweepIn = sweepAt(tenant) - now;
    const timeoutIn = stepTimeoutAt(tenant) - now;

    switch (cond) {
        case 'stalled':
            if (!stage) return null;
            tone = 'hold';
            head = `No progress at ${stage.code} ${stage.name} for ${fmtDuration(quietFor(tenant, now))}.`;
            body = (
                <>
                    The message was most likely rejected by <Mono>{stage.service}</Mono> and dead-lettered to <Mono>{DLX}</Mono> as{' '}
                    <Mono>{stage.deadLetterKey}</Mono>. tenant-service fails the step {fmtDuration(STEP_TIMEOUT_MS)} after its last change
                    ({timeoutIn > 0 ? `in about ${fmtDuration(timeoutIn)}` : 'on its next pass'}), which marks the tenant FAILED and sends{' '}
                    <Mono>tenant.failed</Mono>, unless something moves first.
                </>
            );
            break;
        case 'waiting':
            tone = 'scrub';
            head = 'No stage has started yet.';
            body = (
                <>
                    Nothing has consumed <Mono>tenant.requested</Mono> for this tenant. If it stays this way, the sweeper cancels it{' '}
                    {sweepIn > 0 ? `in about ${fmtDuration(sweepIn)}` : 'on its next run'} ({fmtDuration(SWEEP_AFTER_MS)} after the last
                    change).
                </>
            );
            break;
        case 'failed': {
            const detail = events.map(eventErrorText).find(Boolean);
            tone = 'abort';
            head = stage
                ? `${stage.code} ${stage.name} ${isStepTimeout(detail) ? 'timed out' : 'failed'}.`
                : 'Provisioning failed.';
            body = <>{detail ?? 'Check the event log below for the error payload.'}</>;
            break;
        }
        case 'cancelled': {
            const reason = cancelReasonFrom(tenant, events);
            tone = 'scrub';
            head = isSweeperCancel(reason) ? 'Cancelled by the timeout sweeper.' : 'Provisioning was cancelled.';
            body = reason ? <>Reason: “{reason}”. Finished steps were kept; the rest were marked CANCELLED.</> : null;
            break;
        }
        case 'active': {
            const timeline = stageTimings(tenant, events);
            if (!timeline.completeAt) return null;
            tone = 'go';
            head = `Active. Signup to live took ${fmtDuration(timeline.completeAt - timeline.t0)}.`;
            break;
        }
        default:
            return null;
    }

    const border: Record<Tone, string> = {
        hold: 'border-hold/45 bg-hold/[0.06]',
        abort: 'border-abort/35 bg-abort/[0.05]',
        scrub: 'border-scrub/35 bg-scrub/[0.05]',
        go: 'border-go/35 bg-go/[0.05]',
        ignite: '',
        ink: '',
        blueprint: '',
    };

    return (
        <div className={cn('mb-6 flex gap-3 rounded-md border px-4 py-3', border[tone])}>
            <Swatch tone={tone} className="mt-[7px]" />
            <div className="min-w-0 text-[14.5px] leading-relaxed">
                <p className="font-semibold text-ink">{head}</p>
                {body && <p className="text-ink-2">{body}</p>}
            </div>
        </div>
    );
}

function Mono({ children }: { children: ReactNode }) {
    return <code className="rounded-sm bg-card px-1 py-px font-mono text-[12.5px] text-ink">{children}</code>;
}

function EventTimeline({ events, t0, freshIds }: { events: EventLog[]; t0: number; freshIds: ReadonlySet<string> }) {
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
