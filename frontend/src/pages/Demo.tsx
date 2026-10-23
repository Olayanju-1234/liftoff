import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';
import { ArrowRight, ArrowUpRight, Play, RotateCcw } from 'lucide-react';
import { getDemo, getPublicStatus, retryDemo } from '../lib/api';
import { useNow, useResource } from '../lib/hooks';
import { useEventFeed } from '../lib/feed';
import { DLX, EXCHANGE, TEARDOWN, condition, eventErrorText, failedStage, stageState, stageTimings } from '../lib/pipeline';
import type { Condition } from '../lib/pipeline';
import { SIMPLE_STATUS, SIMPLE_STEPS, SIMPLE_STEP_STATE, simpleStatus, simpleStepLabel, stepName } from '../lib/simple';
import { CORE_TONE, buildBoxes } from '../lib/boxes';
import { FAIL_CHOICES, fmtCountdown, stageForFailStep, useStartDemo } from '../lib/demo';
import type { FailChoice } from '../lib/demo';
import { apiMessage } from '../lib/errors';
import { fmtAgo, fmtDuration } from '../lib/time';
import { TONE_TEXT, buttonClass } from '../lib/ui';
import type { Tone } from '../lib/ui';
import { cn } from '../lib/cn';
import type { DemoView } from '../lib/types';
import SiteShell from '../components/site/SiteShell';
import Panel from '../components/ui/Panel';
import Button from '../components/ui/Button';
import { Segmented } from '../components/ui/Field';
import { Swatch, Tag } from '../components/ui/Tag';
import Schematic from '../components/pipeline/Schematic';
import StageTimeline from '../components/pipeline/StageTimeline';
import EventTimeline from '../components/pipeline/EventTimeline';
import StepMark from '../components/pipeline/StepMark';
import { Progress } from './Status';

// Something is still happening: poll fast. A finished or removed demo barely changes.
function isMoving(view: DemoView) {
    const t = view.tenant;
    if (t.status === 'PROVISIONING' || t.status === 'DEPROVISIONING') return true;
    return t.status === 'DELETED' && t.teardownDbStatus !== 'SUCCESS' && t.teardownDbStatus !== 'SKIPPED';
}

// A visitor's live view of their demo customer: what a company's staff, its customer and its
// engineers would each see, read from the real tenant record and event log.
export default function Demo() {
    const { token = '' } = useParams();
    // A new demo from "Run another" starts clean, at the top.
    return <DemoLive key={token} token={token} />;
}

function DemoLive({ token }: { token: string }) {
    const now = useNow();
    const reduced = useReducedMotion() ?? false;
    const [view, setView] = useState<DemoView>();
    const [fast, setFast] = useState(true);
    const [retrying, setRetrying] = useState(false);
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    const feed = useEventFeed(
        async () => {
            const next = await getDemo(token);
            setView(next);
            setFast(isMoving(next));
            return next.events;
        },
        { interval: fast ? 1500 : 8000, key: token, withTenant: false },
    );
    const statusToken = view?.tenant.statusUrl.split('/status/')[1] ?? '';
    // Polled on its own clock, so it keeps up until it has caught the tenant's last change too.
    const [statusMoving, setStatusMoving] = useState(true);
    const publicStatus = useResource(
        async () => {
            if (!statusToken) return undefined;
            const next = await getPublicStatus(statusToken);
            setStatusMoving(next.state === 'setting-up');
            return next;
        },
        { interval: fast || statusMoving ? 2000 : 15_000, key: statusToken },
    );

    const retry = async () => {
        setRetrying(true);
        try {
            setView(await retryDemo(token));
            setFast(true);
            feed.refresh();
            publicStatus.refresh();
        } catch (err) {
            toast.error(apiMessage(err, 'The retry did not start. Try again in a moment.'));
        } finally {
            setRetrying(false);
        }
    };

    if (!view) {
        const gone = isAxiosError(feed.error) && feed.error.response?.status === 404;
        return (
            <SiteShell sheet="1">
                <div className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6 lg:px-10">
                    {feed.loading ? (
                        <div className="h-72 animate-pulse rounded-md border border-rule bg-card/60" />
                    ) : (
                        <Ended
                            title={gone ? 'This demo has ended' : "We couldn't reach the live demo"}
                            body={
                                gone
                                    ? 'Each demo customer is removed after 15 minutes, or the link was copied incompletely. Start a fresh one: it takes about five seconds.'
                                    : 'The API is not answering right now. The replay on the home page runs the same five steps in your browser.'
                            }
                        />
                    )}
                </div>
            </SiteShell>
        );
    }

    const tenant = view.tenant;
    const events = feed.data ?? view.events;
    const cond = condition(tenant, now);
    const timeline = stageTimings(tenant, events);
    const status = SIMPLE_STATUS[simpleStatus(cond)];
    const created = Date.parse(tenant.createdAt);
    const expiresIn = Date.parse(view.expiresAt) - now;
    const asked = view.failStep ? stageForFailStep(view.failStep) : undefined;

    return (
        <SiteShell sheet="1">
            <section className="mx-auto max-w-[1240px] px-4 pb-8 pt-10 sm:px-6 md:pt-14 lg:px-10">
                <p className="label mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-ink">Live demo</span>
                    <span aria-hidden className="h-px w-8 bg-rule-strong" />
                    <span>The real system, not a recording</span>
                </p>
                <h1 className="font-cond text-[40px] font-bold uppercase leading-[0.92] text-ink sm:text-[56px]">{HEADLINE[cond](tenant.name)}</h1>
                <p className="mt-5 max-w-[720px] text-[16.5px] leading-relaxed text-ink-2">
                    You are a SaaS company called “Your SaaS”, and <strong className="font-semibold text-ink">{tenant.name}</strong> just signed up for
                    it. Liftoff is giving them a database, an address, API keys, a trial and a welcome, on the same seven services every real
                    customer goes through.
                    {asked && (
                        <>
                            {' '}
                            You asked for <strong className="font-semibold text-ink">{stepName(asked).toLowerCase()}</strong> to fail, so you can see what
                            happens when a step breaks.
                        </>
                    )}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13.5px] text-ink-3">
                    <Tag tone={status.tone} live={status.live}>
                        {status.label}
                    </Tag>
                    <span>Signed up {fmtAgo(created, now)}</span>
                    {tenant.status !== 'DELETED' && (
                        <span className="font-mono text-[12px]">
                            {expiresIn > 0 ? `Removed automatically in ${fmtCountdown(expiresIn)}` : 'Being removed now'}
                        </span>
                    )}
                </div>
            </section>

            <div className="mx-auto max-w-[1240px] px-4 pb-16 sm:px-6 lg:px-10">
                <Banner view={view} cond={cond} events={events} now={now} retrying={retrying} onRetry={retry} tookMs={timeline.completeAt ? timeline.completeAt - timeline.t0 : undefined} />

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                    <Panel title="What your team sees" meta="the Customers page, in plain words" flush className="lg:col-span-7">
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
                                            <p className="truncate font-mono text-[11px] text-ink-4">
                                                {stage.service} · {stage.emits}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className={cn('text-[13.5px] font-medium', TONE_TEXT[meta.tone], state === 'PENDING' && 'text-ink-4')}>
                                                {simpleStepLabel(tenant, stage, state)}
                                            </p>
                                            {took && <p className="num font-mono text-[11px] text-ink-3">took {took}</p>}
                                            {state === 'SKIPPED' && <p className="font-mono text-[11px] text-ink-3">{SKIP_WHY[stage.key] ?? ''}</p>}
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                        <p className="border-t border-rule px-4 py-3 text-[13px] text-ink-3 sm:px-5">
                            Support staff see exactly this for every customer, without asking engineering what a dead letter is.
                        </p>
                    </Panel>

                    <div className="lg:col-span-5">
                        <div className="mb-3 flex items-baseline justify-between gap-3">
                            <h2 className="font-cond text-[19px] font-semibold leading-tight text-ink">What {tenant.name} sees</h2>
                            <a href={tenant.statusUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-blueprint hover:underline">
                                Open their page <ArrowUpRight size={13} />
                            </a>
                        </div>
                        {publicStatus.data ? (
                            <Progress status={publicStatus.data} />
                        ) : (
                            <div className="h-72 animate-pulse rounded-md border border-rule bg-card/60" />
                        )}
                        <p className="mt-3 text-[13px] text-ink-3">
                            Every customer gets a private link like this to watch while they wait. It never shows ids, queues or anything technical.
                        </p>
                    </div>
                </div>

                <div className="mb-6 mt-14 grid gap-3 border-b-2 border-ink pb-4 md:grid-cols-12 md:items-end">
                    <div className="md:col-span-5">
                        <p className="label mb-1.5">For engineers</p>
                        <h2 className="font-cond text-[30px] font-semibold uppercase leading-none text-ink sm:text-[34px]">Under the hood</h2>
                    </div>
                    <p className="text-[14.5px] text-ink-2 md:col-span-7">
                        The same run as RabbitMQ and Postgres saw it. tenant-service sends each step to its worker's queue on <Mono>{EXCHANGE}</Mono>; a
                        worker that can't finish rejects the message to <Mono>{DLX}</Mono>, and the step reads FAILED until someone retries it.
                    </p>
                </div>

                <Facts view={view} />

                <Panel fig="Fig. 1" title="Where this customer is" meta="packets replay the real events" flush className="mb-6">
                    <div className="scrollbar-thin overflow-x-auto">
                        <div className="min-w-[780px] px-3 pb-2 pt-4 sm:px-5">
                            <Schematic
                                boxes={buildBoxes(tenant, timeline, now)}
                                core={{ tone: CORE_TONE[cond], line: tenant.status, sub: tenant.subdomain }}
                                packets={feed.packets}
                                onPacketDone={feed.done}
                                reduced={reduced}
                                dlxNote={view.failInjected ? '1 message dead-lettered' : undefined}
                            />
                        </div>
                    </div>
                </Panel>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                    <Panel fig="Fig. 2" title="Stage timings" meta="from the event log" className="xl:col-span-7">
                        <StageTimeline tenant={tenant} timeline={timeline} now={now} />
                    </Panel>
                    <Panel fig="Fig. 3" title="Event log" meta={`${events.length} events · open one for its payload`} flush className="xl:col-span-5">
                        <EventTimeline events={events} t0={timeline.t0} freshIds={feed.freshIds} />
                    </Panel>
                </div>

                <RunAgain />
            </div>
        </SiteShell>
    );
}

const HEADLINE: Record<Condition, (name: string) => string> = {
    running: (n) => `${n} just signed up`,
    waiting: (n) => `${n} just signed up`,
    stalled: (n) => `${n} is waiting on a step`,
    active: (n) => `${n} is ready`,
    failed: (n) => `${n} hit a problem`,
    cancelled: (n) => `${n} was stopped`,
    suspended: (n) => `${n} was stopped`,
    removing: (n) => `${n} is being removed`,
    removed: (n) => `${n} was removed`,
};

// Why a step reads SKIPPED in the demo: nothing is billed, and the demo company has no team to email.
const SKIP_WHY: Partial<Record<string, string>> = {
    billingStatus: 'test customer',
    notificationStatus: 'no team to email',
};

interface BannerProps {
    view: DemoView;
    cond: Condition;
    events: DemoView['events'];
    now: number;
    retrying: boolean;
    onRetry: () => void;
    tookMs?: number;
}

function Banner({ view, cond, events, now, retrying, onRetry, tookMs }: BannerProps) {
    const tenant = view.tenant;
    const stage = failedStage(tenant);
    let tone: Tone;
    let head: string;
    let body: ReactNode;
    let action: ReactNode = null;

    switch (cond) {
        case 'failed': {
            if (!stage) return null;
            const error = events.map(eventErrorText).find(Boolean);
            tone = 'abort';
            head = `${stepName(stage)} failed, and setup stopped there.`;
            body = (
                <>
                    Liftoff does not retry a broken step forever against a half-made account. Your team would get an email and your signup flow a{' '}
                    <Mono>tenant.failed</Mono> webhook; your customer's page says someone is on it. Press Retry, as your support team would.
                    <span className="mt-2 block font-mono text-[12px] text-ink-3">
                        {error ?? `${stage.service} rejected the message, parked on ${DLX} as ${stage.deadLetterKey}`}
                    </span>
                </>
            );
            action =
                tenant.status === 'FAILED' ? (
                    <Button variant="abort" onClick={onRetry} busy={retrying} className="h-11 px-5 text-[15px]">
                        {!retrying && <RotateCcw size={15} />} Retry {stepName(stage).toLowerCase()}
                    </Button>
                ) : null;
            break;
        }
        case 'active':
            tone = 'go';
            head = tookMs
                ? `Ready, ${fmtDuration(tookMs)} after signing up${view.failStep ? ', counting the wait for your retry' : ''}.`
                : 'Ready.';
            body = (
                <>
                    {view.failStep
                        ? `The retry ran the failed step for real and the rest followed. `
                        : 'Every step is done, or skipped on purpose. '}
                    Billing is skipped because this is a test customer, and nobody is emailed because the demo company has no team. With your own
                    Stripe and team connected, both run for real.
                </>
            );
            break;
        case 'removed':
        case 'removing':
            tone = 'scrub';
            head = `Removed${tenant.deletedAt ? ` ${fmtAgo(Date.parse(tenant.deletedAt), now)}` : ''}, as every demo is after 15 minutes.`;
            body = (
                <>
                    The same teardown a churned customer gets:
                    <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12px]">
                        {TEARDOWN.map((part) => (
                            <span key={part.key}>
                                <span className="text-ink-3">{part.plain}</span> <Mono>{tenant[part.key] ?? 'PENDING'}</Mono>
                            </span>
                        ))}
                    </span>
                </>
            );
            break;
        case 'cancelled':
            tone = 'scrub';
            head = 'Setup was stopped before it finished.';
            body = tenant.cancelReason ? <>Reason: “{tenant.cancelReason}”.</> : null;
            break;
        default:
            return null;
    }

    const border: Partial<Record<Tone, string>> = {
        abort: 'border-abort/35 bg-abort/[0.05]',
        go: 'border-go/35 bg-go/[0.05]',
        scrub: 'border-scrub/35 bg-scrub/[0.05]',
    };

    return (
        <div className={cn('mb-6 flex flex-col gap-4 rounded-md border px-4 py-4 sm:flex-row sm:items-center sm:px-5', border[tone])}>
            <div className="flex min-w-0 flex-1 gap-3">
                <Swatch tone={tone} className="mt-[8px]" />
                <div className="min-w-0 text-[14.5px] leading-relaxed">
                    <p className="font-semibold text-ink">{head}</p>
                    {body && <div className="text-ink-2">{body}</div>}
                </div>
            </div>
            {action}
        </div>
    );
}

function Facts({ view }: { view: DemoView }) {
    const t = view.tenant;
    const cells: [string, string][] = [
        ['Tenant ID', t.id],
        ['Schema', t.schemaName ?? '—'],
        ['Address', t.address],
        ['Customer plan', t.planName ?? t.planId],
        ['Injected failure', view.failStep ? `${stageForFailStep(view.failStep).service}${view.failInjected ? ' · sent' : ''}` : 'none'],
    ];
    return (
        <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-ink/70 bg-rule md:grid-cols-5">
            {cells.map(([k, v]) => (
                <div key={k} className="min-w-0 bg-card px-4 py-3" title={v}>
                    <dt className="label mb-1">{k}</dt>
                    <dd className="truncate font-mono text-[13px] text-ink">{v}</dd>
                </div>
            ))}
        </dl>
    );
}

function RunAgain() {
    const [choice, setChoice] = useState<FailChoice>('dns');
    const demo = useStartDemo();
    return (
        <section className="mt-10 flex flex-col gap-5 rounded-md border border-ink bg-ink px-6 py-7 text-paper lg:flex-row lg:items-center lg:px-8">
            <div className="flex-1">
                <p className="font-cond text-[26px] font-semibold uppercase leading-none tracking-[0.01em]">Run another, or break a different step</p>
                <p className="mt-2 text-[15px] text-paper/70">Each run is a new customer through the real pipeline. Five an hour per visitor.</p>
                {demo.error && <p className="mt-2 text-[14px] text-ignite">{demo.error}</p>}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="flex items-center gap-2">
                    <span className="label text-paper/60">Fail</span>
                    <Segmented<FailChoice> label="Make a step fail" value={choice} onChange={setChoice} options={FAIL_CHOICES} />
                </div>
                <Button
                    variant="primary"
                    onClick={() => void demo.start(choice)}
                    busy={demo.starting !== null}
                    className="h-11 border-ignite bg-ignite pl-4 pr-4 text-[15px] text-card hover:border-ignite/90 hover:bg-ignite/90"
                >
                    {demo.starting === null && <Play size={15} />} Run it live
                </Button>
                <Link to="/register" className="inline-flex h-11 items-center gap-2 rounded border border-paper/30 px-4 text-[15px] font-medium text-paper hover:bg-paper/10">
                    Start free <ArrowRight size={15} />
                </Link>
            </div>
        </section>
    );
}

function Ended({ title, body }: { title: string; body: string }) {
    const demo = useStartDemo();
    return (
        <section className="crop mx-auto max-w-[620px] rounded-md border border-rule-strong bg-card px-6 py-7 shadow-sheet sm:px-8">
            <p className="label mb-2">Live demo</p>
            <h1 className="font-cond text-[34px] font-semibold leading-[0.98] text-ink">{title}</h1>
            <p className="mt-3 text-[15px] text-ink-2">{body}</p>
            {demo.error && <p className="mt-3 text-[14px] text-abort">{demo.error}</p>}
            <div className="mt-5 flex flex-wrap gap-3">
                <Button variant="primary" onClick={() => void demo.start()} busy={demo.starting !== null}>
                    {demo.starting === null && <Play size={14} />} Start a new demo
                </Button>
                <Link to="/#demo-replay" className={buttonClass('secondary', 'md')}>
                    Watch the replay
                </Link>
            </div>
        </section>
    );
}

function Mono({ children }: { children: ReactNode }) {
    return <code className="rounded-sm bg-card px-1 py-px font-mono text-[12.5px] text-ink">{children}</code>;
}
