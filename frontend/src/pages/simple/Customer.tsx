import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { formatDistanceStrict } from 'date-fns';
import { ArrowLeft, ArrowRight, Ban, Check, Copy, KeyRound, Trash2 } from 'lucide-react';
import { getTenant, getTenantEvents } from '../../lib/api';
import { useNow, useResource } from '../../lib/hooks';
import { useTenantActions } from '../../lib/useTenantActions';
import {
    activeStage,
    billingSkip,
    cancelReasonFrom,
    condition,
    eventErrorText,
    failedStage,
    isStepTimeout,
    isSweeperCancel,
    planLabel,
    quietFor,
    stageState,
    stageTimings,
    stepTimeoutAt,
    sweepAt,
} from '../../lib/pipeline';
import type { Condition, Stage } from '../../lib/pipeline';
import {
    SIMPLE_STATUS,
    SIMPLE_STEPS,
    SIMPLE_STEP_STATE,
    TRIAL_DAYS,
    simpleStatus,
    stepName,
    tenantHost,
    tenantUrl,
    trialEndsAt,
} from '../../lib/simple';
import { fmtDate, fmtDuration, fmtStamp } from '../../lib/time';
import { TONE_TEXT } from '../../lib/ui';
import type { Tone } from '../../lib/ui';
import { cn } from '../../lib/cn';
import type { EventLog, Tenant } from '../../lib/types';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import Button from '../../components/ui/Button';
import Empty from '../../components/ui/Empty';
import { Swatch, Tag } from '../../components/ui/Tag';
import LoadError from '../../components/LoadError';

export default function Customer() {
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const now = useNow();
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
    const eventsRes = useResource(() => getTenantEvents(id), { interval, key: id });
    const actions = useTenantActions({
        onCancelled: () => {
            tenantRes.refresh();
            eventsRes.refresh();
        },
        onDeleted: () => navigate('/'),
    });

    const tenant = tenantRes.data;
    const events = eventsRes.data ?? [];

    if (!tenant) {
        const missing = isAxiosError(tenantRes.error) && [400, 404].includes(tenantRes.error.response?.status ?? 0);
        return (
            <>
                <BackLink />
                {tenantRes.loading ? (
                    <div className="h-64 animate-pulse rounded-md border border-rule bg-card/60" />
                ) : missing ? (
                    <Panel>
                        <Empty title="We couldn't find that customer" action={<BackLink inline />}>
                            They may have been removed.
                        </Empty>
                    </Panel>
                ) : (
                    <LoadError error={tenantRes.error} what="this customer" onRetry={tenantRes.refresh} busy={tenantRes.refreshing} />
                )}
            </>
        );
    }

    const cond = condition(tenant, now);
    const status = SIMPLE_STATUS[simpleStatus(cond)];
    const timeline = stageTimings(tenant, events);
    const created = Date.parse(tenant.createdAt);

    return (
        <>
            {actions.dialog}
            <BackLink />
            <PageHeader
                eyebrow="Customer"
                title={tenant.name}
                aside={
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13.5px] text-ink-3">
                        <Tag tone={status.tone} live={status.live}>
                            {status.label}
                        </Tag>
                        {tenant.isTest && (
                            <Tag tone="blueprint" title="A test customer: set up like a real one, never billed, not counted towards your limits.">
                                Test
                            </Tag>
                        )}
                        <span>{planLabel(tenant)} plan</span>
                        <span title={fmtStamp(created)}>Added {formatDistanceStrict(created, now, { addSuffix: true })}</span>
                        {live && <span>Updates every 3 seconds</span>}
                    </div>
                }
                actions={
                    <>
                        {tenant.status === 'PROVISIONING' && (
                            <Button onClick={() => actions.requestCancel(tenant)}>
                                <Ban size={14} /> Cancel setup
                            </Button>
                        )}
                        <Button variant="danger" onClick={() => actions.requestDelete(tenant)}>
                            <Trash2 size={14} /> Remove
                        </Button>
                    </>
                }
            />

            {cond === 'active' && (
                <ReadyPanel tenant={tenant} events={events} tookMs={timeline.completeAt ? timeline.completeAt - timeline.t0 : undefined} />
            )}
            <StatusNote tenant={tenant} cond={cond} events={events} now={now} />

            <Panel
                title="Setup progress"
                meta={cond === 'active' ? (billingSkip(tenant) ? 'four steps finished, billing skipped' : 'all five steps finished') : undefined}
                flush
            >
                <ol className="divide-y divide-rule">
                    {SIMPLE_STEPS.map(({ stage }, i) => {
                        const state = stageState(tenant, stage, now);
                        const meta = SIMPLE_STEP_STATE[state];
                        const { start, end } = timeline.stages[i];
                        const took = state === 'SUCCESS' && start !== undefined && end !== undefined ? fmtDuration(end - start) : undefined;
                        return (
                            <li key={stage.key} className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
                                <StepMark state={state} index={i} />
                                <div className="min-w-0 flex-1">
                                    <p className={cn('text-[15px] font-medium', state === 'PENDING' ? 'text-ink-3' : 'text-ink')}>{stepName(stage)}</p>
                                    <p className="truncate font-mono text-[11px] text-ink-4">{stage.emits}</p>
                                </div>
                                <div className="text-right">
                                    <p className={cn('text-[13.5px] font-medium', TONE_TEXT[meta.tone], state === 'PENDING' && 'text-ink-4')}>
                                        {stage.key === 'billingStatus' && billingSkip(tenant) === 'not-connected' ? 'Not connected' : meta.label}
                                    </p>
                                    {took && <p className="num font-mono text-[11px] text-ink-3">took {took}</p>}
                                </div>
                            </li>
                        );
                    })}
                </ol>
                <div className="border-t border-rule px-4 py-2.5 sm:px-5">
                    <Link to={`/tenants/${tenant.id}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-blueprint hover:underline">
                        See how this was provisioned <ArrowRight size={13} />
                    </Link>
                </div>
            </Panel>
        </>
    );
}

function BackLink({ inline = false }: { inline?: boolean }) {
    return (
        <Link to="/" className={cn('inline-flex items-center gap-1.5 text-[13.5px] font-medium text-ink-3 hover:text-ink', !inline && 'mb-4')}>
            <ArrowLeft size={14} /> All customers
        </Link>
    );
}

function StepMark({ state, index }: { state: ReturnType<typeof stageState>; index: number }) {
    const base = 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border font-mono text-[11px] font-medium';
    switch (state) {
        case 'SUCCESS':
            return (
                <span className={cn(base, 'border-go bg-go text-card')} aria-label="Done">
                    <Check size={14} />
                </span>
            );
        case 'IN_PROGRESS':
            return (
                <span className={cn(base, 'anim-ring border-ignite bg-ignite text-card')} aria-label="In progress">
                    {index + 1}
                </span>
            );
        case 'STALLED':
            return (
                <span className={cn(base, 'border-hold bg-hold text-card')} aria-label="Stuck">
                    {index + 1}
                </span>
            );
        case 'FAILED':
            return (
                <span className={cn(base, 'border-abort bg-abort text-card')} aria-label="Failed">
                    !
                </span>
            );
        case 'CANCELLED':
            return <span className={cn(base, 'hatch border-scrub/60 text-transparent')} aria-label="Cancelled" />;
        case 'SKIPPED':
            return (
                <span className={cn(base, 'border-dashed border-ink/50 text-ink-3')} aria-label="Skipped">
                    –
                </span>
            );
        default:
            return <span className={cn(base, 'border-rule-strong bg-card text-ink-4')}>{index + 1}</span>;
    }
}

function ReadyPanel({ tenant, events, tookMs }: { tenant: Tenant; events: EventLog[]; tookMs?: number }) {
    const trialEnd = trialEndsAt(tenant, events);
    const skip = billingSkip(tenant);
    return (
        <Panel title="This customer is ready" meta={tookMs ? `set up in ${fmtDuration(tookMs)}` : undefined} className="mb-6 border-go/40">
            <dl className="grid gap-5 lg:grid-cols-3">
                <div className="min-w-0">
                    <dt className="label mb-1.5">Address</dt>
                    <dd>
                        <CopyRow value={tenantUrl(tenant)} display={tenantHost(tenant)} />
                        <p className="mt-1.5 text-[13px] text-ink-3">Where their team signs in. Set your own domain in Settings.</p>
                    </dd>
                </div>
                <div className="min-w-0">
                    <dt className="label mb-1.5">API key</dt>
                    <dd>
                        <div className="flex h-10 items-center gap-2 rounded border border-rule-strong bg-paper/60 px-3 font-mono text-[13.5px] text-ink">
                            <KeyRound size={14} className="shrink-0 text-ink-3" />
                            <span className="truncate">sk_live_••••••••••••••••</span>
                        </div>
                        <p className="mt-1.5 text-[13px] text-ink-3">Generated and stored securely. It isn't shown in the dashboard.</p>
                    </dd>
                </div>
                <div className="min-w-0">
                    <dt className="label mb-1.5">{skip === 'not-connected' ? 'Billing' : 'Trial'}</dt>
                    <dd>
                        <div className="flex h-10 items-center rounded border border-rule-strong bg-paper/60 px-3 text-[14px] text-ink">
                            {skip === 'test' ? 'None: test customer' : skip === 'not-connected' ? 'Not connected' : `Ends ${fmtDate(trialEnd)}`}
                        </div>
                        <p className="mt-1.5 text-[13px] text-ink-3">
                            {skip === 'test' ? (
                                'Billing was skipped, so nothing starts and nothing is charged.'
                            ) : skip === 'not-connected' ? (
                                <>
                                    No subscription was created. Connect your Stripe account under{' '}
                                    <Link to="/settings" className="font-medium text-blueprint hover:underline">
                                        Settings → Billing
                                    </Link>{' '}
                                    to start trials for new customers.
                                </>
                            ) : (
                                `${TRIAL_DAYS}-day free trial on the ${planLabel(tenant)} plan.`
                            )}
                        </p>
                    </dd>
                </div>
            </dl>
        </Panel>
    );
}

function CopyRow({ value, display }: { value: string; display: string }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    };
    return (
        <div className="flex h-10 items-center gap-2 rounded border border-rule-strong bg-paper/60 pl-3 pr-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[13.5px] text-ink" title={value}>
                {display}
            </span>
            <button
                type="button"
                onClick={copy}
                className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm border border-rule-strong bg-card px-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-2 hover:text-ink"
            >
                {copied ? <Check size={12} className="text-go" /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy'}
            </button>
        </div>
    );
}

const lower = (stage: Stage) => stepName(stage).charAt(0).toLowerCase() + stepName(stage).slice(1);

function StatusNote({ tenant, cond, events, now }: { tenant: Tenant; cond: Condition; events: EventLog[]; now: number }) {
    let tone: Tone = 'ink';
    let head = '';
    let body: ReactNode = null;
    const stage = activeStage(tenant) ?? failedStage(tenant);
    const sweepIn = sweepAt(tenant) - now;
    const autoCancel = sweepIn > 0 ? `in about ${fmtDuration(sweepIn)}` : 'shortly';
    const timeoutIn = stepTimeoutAt(tenant) - now;
    const autoFail = timeoutIn > 0 ? `in about ${fmtDuration(timeoutIn)}` : 'shortly';

    switch (cond) {
        case 'running':
            tone = 'ignite';
            head = stage ? `${stepName(stage)}.` : 'Setting this customer up.';
            body = 'This usually takes less than a minute. They get a welcome email once everything is ready.';
            break;
        case 'waiting':
            tone = 'scrub';
            head = "Setup hasn't started yet.";
            body = `If it doesn't start ${autoCancel}, it will be cancelled automatically and you can add the customer again.`;
            break;
        case 'stalled':
            if (!stage) return null;
            tone = 'hold';
            head = `Setup is stuck while ${lower(stage)}.`;
            body = `Nothing has changed for ${fmtDuration(quietFor(tenant, now))}. Unless it resumes, this step is marked failed ${autoFail} and you'll see what to do here. You can also cancel it now, or remove the customer and add them again.`;
            break;
        case 'failed': {
            tone = 'abort';
            const detail = events.map(eventErrorText).find(Boolean);
            head = stage ? (isStepTimeout(detail) ? `${stepName(stage)} took too long and was stopped.` : `${stepName(stage)} failed.`) : 'Setup failed.';
            body = (
                <>
                    Setup can't continue from here, and the customer hasn't been told anything. Remove them and add them again to retry.
                    {detail && (
                        <span className="mt-1.5 block font-mono text-[12px] text-ink-3">
                            <span className="label mr-2 text-ink-4">Detail</span>
                            {detail}
                        </span>
                    )}
                </>
            );
            break;
        }
        case 'cancelled': {
            const reason = cancelReasonFrom(tenant, events);
            tone = 'scrub';
            head = isSweeperCancel(reason) ? 'Setup was cancelled automatically because it was stuck for too long.' : 'Setup was cancelled.';
            body = 'Finished steps were kept and nothing else will happen. Remove this customer to take them off the list.';
            break;
        }
        default:
            return null;
    }

    const border: Record<Tone, string> = {
        ignite: 'border-ignite/40 bg-ignite/[0.05]',
        hold: 'border-hold/45 bg-hold/[0.06]',
        abort: 'border-abort/35 bg-abort/[0.05]',
        scrub: 'border-scrub/35 bg-scrub/[0.05]',
        go: 'border-go/35 bg-go/[0.05]',
        ink: '',
        blueprint: '',
    };

    return (
        <div className={cn('mb-6 flex gap-3 rounded-md border px-4 py-3', border[tone])}>
            <Swatch tone={tone} live={tone === 'ignite'} className="mt-[7px]" />
            <div className="min-w-0 text-[14.5px] leading-relaxed">
                <p className="font-semibold text-ink">{head}</p>
                {body && <p className="text-ink-2">{body}</p>}
            </div>
        </div>
    );
}
