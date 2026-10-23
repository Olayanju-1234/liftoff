import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { isAxiosError } from 'axios';
import { ArrowLeft, Ban, Check, ChevronRight, Copy, RotateCcw, Trash2 } from 'lucide-react';
import { getTenant, getTenantEvents } from '../lib/api';
import { useNow, useResource } from '../lib/hooks';
import { useEventFeed } from '../lib/feed';
import { useTenantActions } from '../lib/useTenantActions';
import {
    DLX,
    STEP_TIMEOUT_MS,
    SWEEP_AFTER_MS,
    TEARDOWN,
    TEARDOWN_SLOW_MS,
    activeStage,
    billingSkip,
    cancelReasonFrom,
    condition,
    customStep,
    eventErrorText,
    failedStage,
    isStepTimeout,
    isSweeperCancel,
    planLabel,
    quietFor,
    schemaName,
    stageTimings,
    stepMode,
    stepTimeoutAt,
    sweepAt,
    teardownFailed,
    teardownStuck,
    waitingOnCompany,
} from '../lib/pipeline';
import type { Condition } from '../lib/pipeline';
import { tenantHost } from '../lib/simple';
import { fmtAgo, fmtClock, fmtDuration, fmtStamp } from '../lib/time';
import type { Tone } from '../lib/ui';
import { cn } from '../lib/cn';
import type { CustomStepView, EventLog, Tenant } from '../lib/types';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import Button from '../components/ui/Button';
import Empty from '../components/ui/Empty';
import { ConditionTag, Swatch, Tag } from '../components/ui/Tag';
import Schematic from '../components/pipeline/Schematic';
import type { CoreView } from '../components/pipeline/Schematic';
import EventTimeline from '../components/pipeline/EventTimeline';
import { CORE_TONE, buildBoxes } from '../lib/boxes';
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
            setLive(t.status === 'PROVISIONING' || t.status === 'DEPROVISIONING');
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
        onRetried: () => {
            setLive(true);
            tenantRes.refresh();
            feed.refresh();
        },
        onDeleted: () => navigate('/tenants'),
    });
    const retryStage = tenantRes.data?.status === 'FAILED' ? failedStage(tenantRes.data) : undefined;

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
                        {retryStage && (
                            <Button
                                variant="primary"
                                onClick={() => actions.retry(tenant)}
                                busy={actions.retrying === tenant.id}
                                title={
                                    stepMode(tenant, retryStage.api) === 'custom'
                                        ? `Send step.requested for ${retryStage.api} again, with a new requestId`
                                        : `Republish ${retryStage.consumes} to ${retryStage.queue}`
                                }
                            >
                                {actions.retrying !== tenant.id && <RotateCcw size={14} />} Retry {retryStage.code}
                            </Button>
                        )}
                        {tenant.status === 'PROVISIONING' && (
                            <Button onClick={() => actions.requestCancel(tenant)}>
                                <Ban size={14} /> Cancel provisioning
                            </Button>
                        )}
                        {tenant.status === 'DEPROVISIONING' ? (
                            teardownStuck(tenant, now) && (
                                <Button onClick={() => actions.requestDelete(tenant)}>
                                    <RotateCcw size={14} /> Republish tenant.deprovision
                                </Button>
                            )
                        ) : (
                            tenant.status !== 'DELETED' && (
                                <Button variant="danger" onClick={() => actions.requestDelete(tenant)}>
                                    <Trash2 size={14} /> Delete
                                </Button>
                            )
                        )}
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

            {!!tenant.customSteps?.length && (
                <Panel fig="Fig. 4" title="Custom steps" meta="requests to your system, latest per step" flush className="mt-6">
                    <CustomSteps calls={tenant.customSteps} now={now} />
                </Panel>
            )}
        </>
    );
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
        { k: 'Customer plan', v: planLabel(tenant), title: `planId ${tenant.planId}: the customer's plan on your product` },
        {
            k: 'Billing',
            v:
                tenant.stripeSubscriptionId ??
                (stepMode(tenant, 'billing') === 'custom'
                    ? 'custom'
                    : billingSkip(tenant) === 'not-connected'
                      ? 'not connected'
                      : billingSkip(tenant) === 'test'
                        ? 'skipped (test)'
                        : billingSkip(tenant) === 'configured'
                          ? 'skipped (settings)'
                          : '—'),
            title: tenant.stripeSubscriptionId
                ? `Stripe subscription ${tenant.stripeSubscriptionId} (customer ${tenant.stripeCustomerId ?? '?'})`
                : 'No Stripe subscription for this tenant',
        },
        { k: 'Created', v: fmtAgo(Date.parse(tenant.createdAt), now), title: fmtStamp(Date.parse(tenant.createdAt)) },
        { k: 'Last change', v: fmtAgo(Date.parse(tenant.updatedAt), now), title: fmtStamp(Date.parse(tenant.updatedAt)) },
        {
            k: 'Status page',
            v: tenant.statusUrl ? (
                <a href={tenant.statusUrl} target="_blank" rel="noreferrer" className="hover:underline">
                    /status/{tenant.statusUrl.split('/status/')[1]?.slice(0, 8)}…
                </a>
            ) : (
                '—'
            ),
            title: tenant.statusUrl ? `${tenant.statusUrl} (public, plain words only; the token is hashed server-side)` : 'No status page',
        },
    ];
    return (
        <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-ink/70 bg-rule md:grid-cols-4 xl:grid-cols-8">
            {cells.map((c) => (
                <div key={c.k} className="min-w-0 bg-card px-4 py-3" title={c.title}>
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
    const waiting = waitingOnCompany(tenant);
    const request = waiting && customStep(tenant, waiting.api);

    switch (cond) {
        case 'running': {
            if (!waiting) return null;
            tone = 'blueprint';
            head = `${waiting.code} ${waiting.name} is custom: waiting on your system.`;
            body = (
                <>
                    {request ? (
                        <>
                            <Mono>step.requested</Mono> went to <Mono>{request.url}</Mono> as request <Mono>{request.requestId}</Mono>. The step fails
                            if no callback reaches <Mono>/tenants/{tenant.id.slice(0, 6)}…/steps/{waiting.api}/complete</Mono> by{' '}
                            {fmtStamp(Date.parse(request.deadlineAt))}.
                        </>
                    ) : (
                        <>
                            <Mono>step.requested</Mono> went to the step's URL; the step fails if no callback arrives by its deadline.
                        </>
                    )}{' '}
                    The 2-minute builtin step timeout and the 30-minute sweeper don't apply while the company's system has it.
                </>
            );
            break;
        }
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
            body = (
                <>
                    {detail ?? 'Check the event log below for the error payload.'}
                    {stage && tenant.status === 'FAILED' && (
                        <>
                            {' '}
                            {stepMode(tenant, stage.api) === 'custom' ? (
                                <>
                                    Retry sends <Mono>step.requested</Mono> again with a new requestId, by the step settings as they are now, and sets the
                                    step IN_PROGRESS.
                                </>
                            ) : (
                                <>
                                    Retry republishes <Mono>{stage.consumes}</Mono> straight to <Mono>{stage.queue}</Mono> (the payload from the event log,
                                    or rebuilt from the tenant) and sets the step IN_PROGRESS.
                                </>
                            )}
                        </>
                    )}
                </>
            );
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
        case 'removing':
        case 'removed': {
            const failed = teardownFailed(tenant);
            const slow = cond === 'removing' && now - Date.parse(tenant.updatedAt) > TEARDOWN_SLOW_MS;
            tone = failed || slow ? 'hold' : 'scrub';
            head =
                cond === 'removed'
                    ? `DELETED${tenant.deletedAt ? ` ${fmtAgo(Date.parse(tenant.deletedAt), now)}` : ''}. Soft delete: hidden from lists, events kept.`
                    : failed
                      ? 'DEPROVISIONING: a teardown dead-lettered.'
                      : 'DEPROVISIONING: waiting on the workers.';
            body = (
                <>
                    {cond === 'removing' &&
                        (failed || slow
                            ? 'Republishing tenant.deprovision resets the failed parts to IN_PROGRESS; every teardown is idempotent. '
                            : 'tenant.deprovision is out; DELETED follows the last tenant.deprovision.done. ')}
                    <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12px]">
                        {TEARDOWN.map((part) => (
                            <span key={part.key}>
                                <span className="text-ink-3">
                                    {part.name}
                                    {stepMode(tenant, part.step) === 'custom' && ' (step.teardown)'}
                                </span>{' '}
                                <Mono>{tenant[part.key] ?? 'PENDING'}</Mono>
                            </span>
                        ))}
                        {(['address', 'welcome'] as const).map((step) => {
                            const call = customStep(tenant, step, 'teardown');
                            return (
                                call && (
                                    <span key={step}>
                                        <span className="text-ink-3">{step} (step.teardown)</span> <Mono>{call.status}</Mono>
                                    </span>
                                )
                            );
                        })}
                    </span>
                </>
            );
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
        blueprint: 'border-blueprint/35 bg-blueprint/[0.05]',
        ignite: '',
        ink: '',
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

const CALL_TONE: Record<string, Tone> = {
    IN_PROGRESS: 'ignite',
    SUCCESS: 'go',
    FAILED: 'abort',
    CANCELLED: 'scrub',
};

// Every request to the company's system this tenant has had, latest per step and action.
function CustomSteps({ calls, now }: { calls: CustomStepView[]; now: number }) {
    const [open, setOpen] = useState<string | null>(null);
    return (
        <ul className="divide-y divide-rule">
            {calls.map((call) => {
                const tone = CALL_TONE[call.status] ?? 'scrub';
                const detail = call.error ?? (call.output ? JSON.stringify(call.output) : null);
                const isOpen = open === call.requestId;
                return (
                    <li key={call.requestId} className="px-4 py-3 sm:px-5">
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                            <Tag tone={tone} live={tone === 'ignite'}>
                                {call.status}
                            </Tag>
                            <span className="font-mono text-[13px] font-medium text-ink">
                                {call.action === 'teardown' ? 'step.teardown' : 'step.requested'} · {call.step}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-3" title={call.url}>
                                {call.url}
                            </span>
                            <span className="font-mono text-[11.5px] text-ink-3" title={fmtStamp(Date.parse(call.requestedAt))}>
                                sent {fmtAgo(Date.parse(call.requestedAt), now)}
                            </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[11.5px] text-ink-3">
                            <span>requestId {call.requestId}</span>
                            {call.completedAt ? (
                                <span title={fmtStamp(Date.parse(call.completedAt))}>closed {fmtAgo(Date.parse(call.completedAt), now)}</span>
                            ) : (
                                <span title={fmtStamp(Date.parse(call.deadlineAt))}>deadline {fmtStamp(Date.parse(call.deadlineAt))}</span>
                            )}
                            {detail && (
                                <button
                                    type="button"
                                    onClick={() => setOpen(isOpen ? null : call.requestId)}
                                    className={cn('inline-flex items-center gap-1 hover:text-ink', call.error ? 'text-abort' : 'text-ink-2')}
                                >
                                    <ChevronRight size={12} className={cn('transition-transform', isOpen && 'rotate-90')} />
                                    {call.error ? 'error' : 'output'}
                                </button>
                            )}
                        </div>
                        {isOpen && (call.error ? <p className="mt-2 font-mono text-[12px] text-abort">{call.error}</p> : <PayloadView payload={call.output} className="mt-2" />)}
                    </li>
                );
            })}
        </ul>
    );
}
