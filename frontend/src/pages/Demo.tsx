import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { isAxiosError } from 'axios';
import { ArrowRight, ArrowUpRight, Play, RotateCcw } from 'lucide-react';
import { getDemo, getDemoEvents, retryDemo } from '../lib/api';
import { apiMessage } from '../lib/errors';
import { useNow, useResource } from '../lib/hooks';
import { useEventFeed } from '../lib/feed';
import { DLX, STAGES, condition, eventErrorText, failedStage, stageState, stageTimings } from '../lib/pipeline';
import type { Stage } from '../lib/pipeline';
import { STEP_NAMES, simpleStepLabel, SIMPLE_STEP_STATE } from '../lib/simple';
import { fmtDuration } from '../lib/time';
import { buttonClass } from '../lib/ui';
import { cn } from '../lib/cn';
import type { DemoRun, EventLog } from '../lib/types';
import SiteShell, { Code } from '../components/site/SiteShell';
import { DEMO_STEP_LABEL, useStartDemo } from '../lib/demo';
import Panel from '../components/ui/Panel';
import Button from '../components/ui/Button';
import Empty from '../components/ui/Empty';
import LoadError from '../components/LoadError';
import { ConditionTag, Swatch } from '../components/ui/Tag';
import Schematic from '../components/pipeline/Schematic';
import type { CoreView } from '../components/pipeline/Schematic';
import StageTimeline from '../components/pipeline/StageTimeline';
import SequenceTrack from '../components/pipeline/SequenceTrack';
import EventTimeline from '../components/pipeline/EventTimeline';
import { CORE_TONE, buildBoxes } from '../lib/wiring';

const FINISHED = ['SUCCESS', 'SKIPPED'];

// A run of the public live demo: the real pipeline, watched without an account. The top half is
// for anyone; the figures below are the same ones a company's engineers get under the hood.
export default function Demo() {
    const { token = '' } = useParams();
    const now = useNow();
    const reduced = useReducedMotion() ?? false;
    const [live, setLive] = useState(true);
    const interval = live ? 2000 : 15_000;

    const run = useResource(
        async () => {
            const next = await getDemo(token);
            setLive(next.tenant.status === 'PROVISIONING' || next.tenant.status === 'DEPROVISIONING');
            return next;
        },
        { interval, key: token },
    );
    const feed = useEventFeed(() => getDemoEvents(token), { interval, key: token, withTenant: false });
    const again = useStartDemo();
    const [retrying, setRetrying] = useState(false);
    const [retryError, setRetryError] = useState<string | null>(null);

    const retry = async () => {
        setRetrying(true);
        setRetryError(null);
        try {
            await retryDemo(token);
            setLive(true);
            run.refresh();
            feed.refresh();
        } catch (err) {
            setRetryError(apiMessage(err, 'The retry did not go through. Try again in a moment.'));
        } finally {
            setRetrying(false);
        }
    };

    if (!run.data) {
        const missing = isAxiosError(run.error) && [400, 404].includes(run.error.response?.status ?? 0);
        return (
            <SiteShell sheet="1">
                <section className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6 lg:px-10">
                    {run.loading ? (
                        <div className="h-72 animate-pulse rounded-md border border-rule bg-card/60" />
                    ) : missing ? (
                        <Panel>
                            <Empty
                                title="No live run at this link"
                                action={
                                    <Button variant="primary" busy={again.busy} onClick={() => void again.start()}>
                                        <Play size={14} /> Start a new one
                                    </Button>
                                }
                            >
                                The link may be mistyped. Runs you started are still here after they are removed.
                            </Empty>
                        </Panel>
                    ) : (
                        <LoadError error={run.error} what="this live run" onRetry={run.refresh} busy={run.refreshing} />
                    )}
                    {again.error && <p role="alert" className="mt-3 text-[14px] text-abort">{again.error}</p>}
                </section>
            </SiteShell>
        );
    }

    const current = run.data;
    const { tenant, demo } = current;
    const events = feed.data ?? [];
    const cond = condition(tenant, now);
    const timeline = stageTimings(tenant, events);
    const boxes = buildBoxes(tenant, timeline, now);
    const core: CoreView = { tone: CORE_TONE[cond], line: tenant.status, sub: tenant.subdomain };
    const failed = tenant.status === 'FAILED' ? failedStage(tenant) : undefined;
    const removed = tenant.status === 'DELETED' || tenant.status === 'DEPROVISIONING';
    const removesIn = Date.parse(demo.expiresAt) - now;
    const failStage = demo.failStep ? STAGES.find((s) => s.api === demo.failStep) : undefined;

    return (
        <SiteShell sheet="1">
            <section className="mx-auto max-w-[1240px] px-4 pb-16 pt-10 sm:px-6 lg:px-10">
                <p className="label mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-ink">Live demo</span>
                    <span aria-hidden className="h-px w-8 bg-rule-strong" />
                    <span>Real services, real messages, on the live server</span>
                </p>
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
                    <div className="min-w-0">
                        <h1 className="font-cond text-[44px] font-bold uppercase leading-[0.95] text-ink sm:text-[56px]">{tenant.name}</h1>
                        <p className="mt-3 max-w-[640px] text-[16px] leading-relaxed text-ink-2">
                            A throwaway customer of a pretend company, going through liftoff the way a real signup does.
                            {removed ? ' It has been removed.' : removesIn > 0 ? ` Removed in ${fmtDuration(removesIn)}.` : ' Being removed now.'}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <ConditionTag condition={cond} />
                        <SequenceTrack tenant={tenant} now={now} size="md" labels />
                    </div>
                </div>

                <Headline run={current} events={events} failed={failed} />

                <div className="mt-5 flex flex-wrap items-center gap-3">
                    {failed && (
                        <Button variant="primary" busy={retrying} onClick={() => void retry()} className="h-11">
                            {!retrying && <RotateCcw size={14} />} Retry {DEMO_STEP_LABEL[failed.api].toLowerCase()}
                        </Button>
                    )}
                    <a href={`/status/${token}`} target="_blank" rel="noreferrer" className={cn(buttonClass('secondary', 'md'), 'h-11')}>
                        What the customer sees <ArrowUpRight size={14} />
                    </a>
                    <Button busy={again.busy} onClick={() => void again.start(demo.failStep ?? undefined)} className="h-11">
                        {!again.busy && <Play size={14} />} Run another
                    </Button>
                    <Link to="/register" className={cn(buttonClass('secondary', 'md'), 'h-11')}>
                        Use it for your customers <ArrowRight size={14} />
                    </Link>
                </div>
                {(retryError || again.error) && (
                    <p role="alert" className="mt-3 text-[14px] text-abort">
                        {retryError ?? again.error}
                    </p>
                )}

                <ol className="mt-8 grid gap-px overflow-hidden rounded-md border border-ink/70 bg-rule sm:grid-cols-5" aria-label="The five steps">
                    {STAGES.map((stage) => (
                        <StepCell key={stage.key} stage={stage} run={current} now={now} />
                    ))}
                </ol>

                <h2 className="mb-4 mt-12 font-cond text-[28px] font-semibold uppercase leading-none text-ink">Under the hood</h2>
                <p className="mb-6 max-w-[760px] text-[15px] leading-relaxed text-ink-2">
                    The same views a company's engineers get. Every packet below is a real message on RabbitMQ, and every line in the
                    event log was written by the service that did the work.
                </p>

                <Panel fig="Fig. 1" title="Where this customer is" meta="orchestrated by tenant-service" flush className="mb-6">
                    <div className="scrollbar-thin overflow-x-auto">
                        <div className="min-w-[780px] px-3 pb-2 pt-4 sm:px-5">
                            <Schematic
                                boxes={boxes}
                                core={core}
                                packets={feed.packets}
                                onPacketDone={feed.done}
                                reduced={reduced}
                                dlxNote={boxes.some((b) => b.dlq) ? 'message dead-lettered' : undefined}
                            />
                        </div>
                    </div>
                </Panel>

                {failStage && <FailureNote stage={failStage} injectedAt={demo.failedOnPurposeAt} />}

                <div className="grid gap-6 xl:grid-cols-12">
                    <Panel fig="Fig. 2" title="Stage timings" meta="from the event log" className="xl:col-span-7">
                        <StageTimeline tenant={tenant} timeline={timeline} now={now} />
                    </Panel>
                    <Panel fig="Fig. 3" title="Event log" meta={`${events.length} events`} flush className="xl:col-span-5">
                        {events.length === 0 ? (
                            <Empty title={feed.loading ? 'Reading events…' : 'No events yet'} />
                        ) : (
                            <EventTimeline events={events} t0={timeline.t0} freshIds={feed.freshIds} />
                        )}
                    </Panel>
                </div>
            </section>
        </SiteShell>
    );
}

// One sentence a support person could read out, then what to do about it.
function Headline({ run, events, failed }: { run: DemoRun; events: EventLog[]; failed?: Stage }) {
    const { tenant, demo } = run;
    const done = STAGES.filter((s) => FINISHED.includes(tenant[s.key])).length;
    let tone = 'border-ignite/40 bg-ignite/[0.05]';
    let body: ReactNode;

    if (failed) {
        tone = 'border-abort/40 bg-abort/[0.05]';
        const onPurpose = demo.failStep === failed.api;
        const reason = onPurpose ? 'on purpose, because you asked it to' : (events.map(eventErrorText).find(Boolean) ?? 'see the event log');
        body = (
            <>
                <strong>{STEP_NAMES[failed.key]} failed</strong>, {reason}. This is what your team sees when a step breaks: the customer
                stops there, nothing after it runs, and nothing before it is undone. Retry runs just that step again.
            </>
        );
    } else if (tenant.status === 'ACTIVE') {
        tone = 'border-go/40 bg-go/[0.06]';
        const timeline = stageTimings(tenant, events);
        const took = timeline.completeAt ? ` Signup to ready took ${fmtDuration(timeline.completeAt - timeline.t0)}` : '';
        body = (
            <>
                <strong>Ready.</strong>
                {took}
                {took && (demo.failedOnPurposeAt ? ', including the failure and your retry.' : '.')} Database, address, API keys and
                trial are all in place, and the team was told.
            </>
        );
    } else if (tenant.status === 'DELETED' || tenant.status === 'DEPROVISIONING') {
        tone = 'border-rule-strong bg-paper-deep/60';
        body = (
            <>
                <strong>Removed.</strong> After 15 minutes the customer was deleted the same way a real one is: its database schema
                dropped and its keys revoked.
            </>
        );
    } else if (tenant.status === 'CANCELLED') {
        tone = 'border-rule-strong bg-paper-deep/60';
        body = <strong>Stopped before it finished.</strong>;
    } else {
        const current = STAGES.find((s) => tenant[s.key] === 'IN_PROGRESS');
        body = (
            <>
                <strong>Setting up.</strong> {done} of 5 done{current ? `, now ${STEP_NAMES[current.key].toLowerCase()}` : ''}.
                {demo.failStep && !demo.failedOnPurposeAt && ` ${DEMO_STEP_LABEL[demo.failStep]} is going to fail, as you asked.`}
            </>
        );
    }

    return (
        <p aria-live="polite" className={cn('mt-6 max-w-[860px] rounded-md border px-4 py-3 text-[15.5px] leading-relaxed text-ink', tone)}>
            {body}
        </p>
    );
}

function StepCell({ stage, run, now }: { stage: Stage; run: DemoRun; now: number }) {
    const state = stageState(run.tenant, stage, now);
    return (
        <li className="bg-card px-4 py-3">
            <p className="label mb-1">{DEMO_STEP_LABEL[stage.api]}</p>
            <p className="flex items-center gap-2 text-[14.5px] font-medium text-ink">
                <Swatch tone={SIMPLE_STEP_STATE[state].tone} live={state === 'IN_PROGRESS'} />
                {simpleStepLabel(run.tenant, stage, state)}
            </p>
            <p className="mt-0.5 text-[12.5px] text-ink-3">{STEP_NAMES[stage.key]}</p>
        </li>
    );
}

function FailureNote({ stage, injectedAt }: { stage: Stage; injectedAt: string | null }) {
    return (
        <div className="mb-6 rounded-md border border-dashed border-rule-strong bg-card px-5 py-4 text-[14.5px] leading-relaxed text-ink-2">
            <p className="label mb-2">How the failure works</p>
            {injectedAt ? (
                <p>
                    Instead of sending this step's input to <Code>{stage.queue}</Code>, tenant-service published it to{' '}
                    <Code tone="text-abort">{DLX}</Code> as <Code>{stage.deadLetterKey}</Code>, exactly where a worker's rejected
                    message goes. The dead-letter consumer marked the step FAILED and logged why, and a copy was parked on{' '}
                    <Code>provisioning.dead-letters</Code> like any other. Retry republishes the same input to <Code>{stage.queue}</Code>,
                    and this time the worker gets it.
                </p>
            ) : (
                <p>
                    When the run reaches this step, tenant-service will publish its input to <Code tone="text-abort">{DLX}</Code> as{' '}
                    <Code>{stage.deadLetterKey}</Code> instead of to <Code>{stage.queue}</Code>, where a worker's rejected message goes.
                </p>
            )}
        </div>
    );
}
