import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Check, Loader2, Play } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { DLX, STAGES, STALL_AFTER_MS } from '../lib/pipeline';
import { buttonClass } from '../lib/ui';
import { useNow } from '../lib/hooks';
import { FAIL_CHOICES, useStartDemo } from '../lib/demo';
import type { FailChoice } from '../lib/demo';
import { fmtDuration } from '../lib/time';
import type { Tenant } from '../lib/types';
import DemoSequence from '../components/pipeline/DemoSequence';
import SequenceTrack from '../components/pipeline/SequenceTrack';
import SiteShell, { Code, SectionHead, Soon } from '../components/site/SiteShell';
import CodeBlock from '../components/site/CodeBlock';
import PricingTable from '../components/site/PricingTable';
import { API_BASE, REPO } from '../components/site/site';
import Button from '../components/ui/Button';
import { Segmented } from '../components/ui/Field';
import { cn } from '../lib/cn';

const TICKET = [
    ['01', 'Database', STAGES[0].typicalMs],
    ['02', 'Address', STAGES[1].typicalMs],
    ['03', 'API key', STAGES[2].typicalMs],
    ['04', 'Trial', STAGES[3].typicalMs],
    ['05', 'Welcome', STAGES[4].typicalMs],
] as const;
const TICKET_TOTAL = TICKET.reduce((a, [, , ms]) => a + ms, 0);

const AUDIENCE: [string, string, string][] = [
    ['Founders', 'Stop provisioning accounts by hand.', 'A signup becomes one API call. Nobody on your team touches a database to onboard a customer.'],
    ['Support', 'See what every customer got.', 'A plain-language view of each customer: what is ready, what is waiting, what broke, without asking engineering.'],
    ['Engineers', 'A saga you can read.', 'Seven small services, one exchange, dead letters you can see. Open source, so you can check every claim.'],
];

interface Deliverable {
    n: string;
    title: string;
    body: string;
    spec: string;
    soon?: string;
}

const DELIVERABLES: Deliverable[] = [
    {
        n: '01',
        title: 'An isolated database',
        body: "Every customer gets its own Postgres schema, created the moment they sign up. One customer's data never shares a table with another's.",
        spec: 'CREATE SCHEMA tenant_globex',
    },
    {
        n: '02',
        title: 'An address',
        body: 'The customer’s subdomain is reserved and recorded, so your product has somewhere to send them straight after signup.',
        spec: 'globex.liftoff.ojusentinel.com',
        soon: 'Your own domain',
    },
    {
        n: '03',
        title: 'API keys',
        body: 'A live key is issued and stored for the customer, ready for your product to hand over when they open the developer page.',
        spec: 'sk_live_4f9c… issued',
    },
    {
        n: '04',
        title: 'A trial subscription',
        body: 'A billing customer and a 14-day trial exist before anyone on your team has heard the customer’s name.',
        spec: 'trial_end: +14 days',
        soon: 'On your Stripe',
    },
    {
        n: '05',
        title: 'A welcome',
        body: 'The customer flips to Active, the event is logged, and your team is told the customer is ready.',
        spec: 'tenant.active',
        soon: 'Email + webhook',
    },
];

const CURL = `curl -X POST ${API_BASE}/tenants \\
  -H "Authorization: Bearer lk_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{ "name": "Globex", "subdomain": "globex", "planId": "starter" }'

# 202 Accepted — provisioning has started`;

const WEBHOOK = `POST https://api.globex.com/liftoff/webhook
x-liftoff-event: tenant.active
x-liftoff-signature: sha256=9b2f…

{ "event": "tenant.active",
  "tenant": { "id": "ckx…", "subdomain": "globex", "status": "ACTIVE" } }`;

function sampleTenant(overrides: Partial<Tenant>, now: number): Tenant {
    const iso = new Date(now).toISOString();
    return {
        id: 'sample',
        name: 'Sample',
        subdomain: 'sample',
        status: 'PROVISIONING',
        planId: 'pro',
        dbStatus: 'SUCCESS',
        dnsStatus: 'SUCCESS',
        credentialsStatus: 'PENDING',
        billingStatus: 'PENDING',
        notificationStatus: 'PENDING',
        createdAt: iso,
        updatedAt: iso,
        ...overrides,
    };
}

export default function Landing() {
    const { isAuthenticated } = useAuth();
    const now = useNow();
    const stalledAgo = new Date(now - STALL_AFTER_MS - 14_000).toISOString();
    const primaryTo = isAuthenticated ? '/' : '/register';
    const primaryLabel = isAuthenticated ? 'Open the dashboard' : 'Start free';
    const demo = useStartDemo();
    const [failChoice, setFailChoice] = useState<FailChoice>('none');
    const { hash } = useLocation();

    // The router doesn't scroll to a #section on its own, e.g. "Watch the replay" from a demo that ended.
    useEffect(() => {
        if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
    }, [hash]);

    // No live demo (down or rate-limited): the replay below is the fallback, so take them there.
    useEffect(() => {
        if (demo.error) document.getElementById('demo-replay')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [demo.error]);

    return (
        <SiteShell sheet="1">
            <section className="mx-auto grid max-w-[1240px] gap-10 px-4 pb-10 pt-12 sm:px-6 md:pt-16 lg:grid-cols-12 lg:px-10">
                <div className="lg:col-span-7">
                    <p className="label mb-5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-ink">Customer onboarding for B2B SaaS</span>
                        <span aria-hidden className="h-px w-8 bg-rule-strong" />
                        <span>One API call from your signup flow</span>
                    </p>
                    <h1 className="font-cond text-[48px] font-bold uppercase leading-[0.9] tracking-[-0.005em] text-ink sm:text-[66px] lg:text-[80px]">
                        Onboard B2B
                        <br />
                        customers
                        <br />
                        <span className="relative">
                            in seconds
                            <span aria-hidden className="anim-blink ml-1 inline-block h-[0.62em] w-[0.36em] translate-y-[-0.04em] bg-ignite" />
                        </span>
                    </h1>
                    <p className="mt-7 max-w-[600px] text-[17px] leading-relaxed text-ink-2">
                        Your customer signs up. Liftoff gives them an isolated database, an address, API keys, a trial subscription
                        and a welcome, then tells your team it is done. Your support staff get a dashboard they can read without
                        asking engineering.
                    </p>
                    <div className="mt-8 flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={() => void demo.start()}
                            disabled={demo.starting !== null}
                            className={cn(buttonClass('primary', 'md'), 'h-11 pl-5 pr-1.5 text-[15px]')}
                        >
                            Try it live, no signup
                            <span className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-sm bg-ignite text-card">
                                {demo.starting === 'none' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Play size={16} />}
                            </span>
                        </button>
                        <Link to={primaryTo} className={cn(buttonClass('secondary', 'md'), 'h-11')}>
                            {primaryLabel}
                        </Link>
                        <Link to="/docs" className={cn(buttonClass('ghost', 'md'), 'h-11')}>
                            Read the docs
                        </Link>
                    </div>
                    <p className="mt-4 font-mono text-[11.5px] text-ink-3">
                        One click sends a real customer through the real pipeline · Free for 10 active tenants · No card · Open source
                    </p>
                </div>

                <aside className="self-end lg:col-span-5" aria-label="Sample delivery ticket">
                    <div className="crop rounded-md border border-ink/70 bg-card shadow-sheet">
                        <div className="flex items-center justify-between border-b border-ink/70 px-4 py-2">
                            <span className="label text-ink">Fig. A · Delivery ticket</span>
                            <span className="font-mono text-[10.5px] text-ink-3">No. 0417</span>
                        </div>
                        <dl className="grid grid-cols-2 divide-x divide-rule border-b border-rule">
                            {[
                                ['Customer', 'Globex'],
                                ['Requested by', 'POST /tenants'],
                                ['Received', '09:41:03.120'],
                                ['Ready', `09:41:07.310 · ${fmtDuration(TICKET_TOTAL)}`],
                            ].map(([k, v]) => (
                                <div key={k} className="px-4 py-2.5">
                                    <dt className="label">{k}</dt>
                                    <dd className="num mt-0.5 font-mono text-[13px] text-ink">{v}</dd>
                                </div>
                            ))}
                        </dl>
                        <ul className="divide-y divide-rule">
                            {TICKET.map(([n, label, ms]) => (
                                <li key={n} className="grid grid-cols-[32px_1fr_auto_auto] items-center gap-3 px-4 py-2">
                                    <span className="num font-mono text-[11.5px] text-ink-3">{n}</span>
                                    <span className="text-[14px] font-medium text-ink">{label}</span>
                                    <span className="num font-mono text-[11.5px] text-ink-3">{fmtDuration(ms)}</span>
                                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-go text-card">
                                        <Check size={12} strokeWidth={3} />
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <div className="flex items-center justify-between gap-3 border-t border-ink/70 bg-paper/60 px-4 py-2.5">
                            <span className="font-mono text-[11.5px] text-ink-2">5 of 5 items · tenant ACTIVE</span>
                            <span className="inline-flex items-center gap-2 font-mono text-[11px] text-ink-3">
                                webhook → api.globex.com <Soon>Next release</Soon>
                            </span>
                        </div>
                    </div>
                </aside>
            </section>

            <section className="mx-auto max-w-[1240px] px-4 pb-16 sm:px-6 lg:px-10" aria-label="Who it is for">
                <div className="grid gap-px overflow-hidden rounded-md border border-ink/70 bg-rule md:grid-cols-3">
                    {AUDIENCE.map(([who, head, body]) => (
                        <div key={who} className="bg-card px-5 py-5">
                            <p className="label mb-2">{who}</p>
                            <p className="font-cond text-[22px] font-semibold leading-tight text-ink">{head}</p>
                            <p className="mt-1.5 text-[14.5px] text-ink-2">{body}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section id="what-you-get" className="border-t border-rule bg-paper/70">
                <div className="mx-auto max-w-[1240px] px-4 py-16 sm:px-6 lg:px-10">
                    <SectionHead
                        sheet="01"
                        title="What every customer gets"
                        lede="Five things, in order, a few seconds after your signup form submits. Each one is a separate step with its own status, so when something is late you know exactly what."
                    />
                    <ol className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
                        {DELIVERABLES.map((d) => (
                            <li key={d.n} className="flex flex-col rounded-md border border-rule bg-card p-5 shadow-sheet">
                                <div className="mb-3 flex items-center justify-between">
                                    <span className="font-mark text-[12px] tracking-[0.12em] text-ink">{d.n}</span>
                                    {d.soon && <Soon>{d.soon} · soon</Soon>}
                                </div>
                                <h3 className="font-cond text-[24px] font-semibold leading-tight text-ink">{d.title}</h3>
                                <p className="mt-2 flex-1 text-[14.5px] leading-relaxed text-ink-2">{d.body}</p>
                                <p className="mt-4 border-t border-rule pt-3 font-mono text-[11.5px] text-ink-3 [overflow-wrap:anywhere]">{d.spec}</p>
                            </li>
                        ))}
                    </ol>
                    <p className="mt-5 text-[13.5px] text-ink-3">
                        Honest footnote: on the hosted service today the trial is recorded without charging anyone, and the welcome is
                        logged rather than emailed. Connecting your own Stripe and emailing your team ship with the next releases.{' '}
                        <Link to="/docs#steps" className="link">
                            Details in the docs
                        </Link>
                        .
                    </p>
                </div>
            </section>

            <section id="how-it-works" className="border-t border-rule">
                <div className="mx-auto max-w-[1240px] px-4 py-16 sm:px-6 lg:px-10">
                    <SectionHead
                        sheet="02"
                        title="How it works"
                        lede="Three things touch your code: a key, a request and a webhook. Everything in between runs on our side and shows up on your dashboard."
                    />
                    <div className="grid gap-6 lg:grid-cols-3">
                        <Step n="1" title="Create an API key" tag={<Soon>Next release</Soon>}>
                            <p>
                                In Settings, create a company key. It is shown once. Until company keys land, the same request works with the
                                token you get from <Code>POST /auth/login</Code>.
                            </p>
                            <div className="mt-4 rounded-md border border-dashed border-rule-strong bg-paper/60 px-4 py-3 font-mono text-[12.5px] text-ink-2">
                                lk_live_7Hq2…<span className="text-ink-4"> · shown once</span>
                            </div>
                        </Step>
                        <Step n="2" title="Call it from your signup flow">
                            <p>One request per new customer. You get a 202 straight away; the five steps run in the background.</p>
                            <CodeBlock code={CURL} title="Request" lang="curl" className="mt-4" />
                        </Step>
                        <Step n="3" title="Get told when it's ready" tag={<Soon>Next release</Soon>}>
                            <p>
                                A signed <Code>tenant.active</Code> or <Code>tenant.failed</Code> webhook hits your URL. Meanwhile the
                                dashboard shows the customer going green, step by step.
                            </p>
                            <CodeBlock code={WEBHOOK} title="Webhook" lang="http" className="mt-4" />
                        </Step>
                    </div>
                    <div className="mt-8 flex flex-wrap items-center gap-3">
                        <Link to="/docs" className={buttonClass('primary', 'md')}>
                            Quickstart in the docs <ArrowRight size={14} />
                        </Link>
                        <a href={`${API_BASE}/api/docs`} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'md')}>
                            API reference <ArrowUpRight size={14} />
                        </a>
                    </div>
                </div>
            </section>

            <section id="pricing" className="border-t border-rule bg-paper/70">
                <div className="mx-auto max-w-[1240px] px-4 py-16 sm:px-6 lg:px-10">
                    <SectionHead
                        sheet="03"
                        title="Pricing"
                        lede={
                            <>
                                Free while you evaluate, per active tenant when you go live. Numbers are not final; the shape is.{' '}
                                <Link to="/pricing" className="link">
                                    Full pricing page
                                </Link>
                                .
                            </>
                        }
                    />
                    <PricingTable compact />
                </div>
            </section>

            <section id="built-on" className="border-t border-rule">
                <div className="mx-auto max-w-[1240px] px-4 py-16 sm:px-6 lg:px-10">
                    <SectionHead
                        sheet="04"
                        title="Built on"
                        lede="Each step is its own small service. tenant-service hands each one its message over RabbitMQ and catches what they reject, so a slow or broken step never takes the others down. The figure replays one signup in your browser; Run it live sends a real one through."
                    />
                    <div id="demo-replay" className="crop scroll-mt-24 rounded-md border border-rule-strong bg-card shadow-lift">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule px-4 pb-3 pt-4 sm:px-5">
                            <span className="label">Fig. 1</span>
                            <h3 className="font-cond text-[22px] font-semibold leading-tight">One signup, end to end</h3>
                            <span className="text-[14px] text-ink-3">Packets carry their routing keys. Inject a failure to see where it lands.</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-rule bg-ignite/[0.05] px-4 py-3 sm:px-5">
                            <p className="min-w-[240px] flex-1 text-[14px] text-ink-2">
                                <span className="font-semibold text-ink">This one is a replay.</span> Run it live to send a real customer through the real
                                services, and pick a step to break if you want to see a dead letter and a retry.
                            </p>
                            <div className="flex items-center gap-2">
                                <span className="label">Fail</span>
                                <Segmented<FailChoice> label="Make a step fail in the live run" value={failChoice} onChange={setFailChoice} options={FAIL_CHOICES} />
                            </div>
                            <Button variant="primary" onClick={() => void demo.start(failChoice)} busy={demo.starting !== null}>
                                {demo.starting === null && <Play size={14} />} Run it live
                            </Button>
                        </div>
                        {demo.error && (
                            <p role="status" className="border-b border-abort/30 bg-abort/[0.05] px-4 py-2.5 text-[14px] text-abort sm:px-5">
                                {demo.error} The replay below runs the same five steps in your browser.
                            </p>
                        )}
                        <DemoSequence />
                    </div>

                    <div className="mt-10 grid gap-5 md:grid-cols-3">
                        <Note n="1" title="A broken step stops, it doesn't loop">
                            <p>
                                A worker that cannot finish rejects the message. It is parked on <Code tone="text-abort">{DLX}</Code> as{' '}
                                <Code>&lt;service&gt;.failed</Code> instead of being retried forever against a customer’s half-made account.
                            </p>
                        </Note>
                        <Note n="2" title="Stalls show up in a minute">
                            <p>Any step with no progress for {STALL_AFTER_MS / 1000} seconds is flagged on the dashboard with the step and queue named.</p>
                            <div className="mt-5 flex items-center gap-3">
                                <SequenceTrack tenant={sampleTenant({ credentialsStatus: 'IN_PROGRESS', updatedAt: stalledAgo }, now)} now={now} size="md" labels />
                                <span className="font-mono text-[11px] font-medium text-hold">KEY · 74 s quiet</span>
                            </div>
                        </Note>
                        <Note n="3" title="Nothing provisions forever">
                            <p>A step with no progress for 2 minutes is failed with the reason recorded, and a sweeper cancels anything else stuck for 30 minutes, so a customer is never silently “pending” for a day.</p>
                            <div className="mt-5 flex items-center gap-3">
                                <SequenceTrack
                                    tenant={sampleTenant(
                                        { status: 'CANCELLED', credentialsStatus: 'CANCELLED', billingStatus: 'CANCELLED', notificationStatus: 'CANCELLED' },
                                        now,
                                    )}
                                    now={now}
                                    size="md"
                                    labels
                                />
                                <span className="font-mono text-[11px] font-medium text-scrub">swept at 30 min</span>
                            </div>
                        </Note>
                    </div>

                    <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-ink/70 bg-rule text-[13px] md:grid-cols-6">
                        {[
                            ['Services', '7 × NestJS'],
                            ['Transport', 'RabbitMQ'],
                            ['Isolation', 'Schema per tenant'],
                            ['Failures', 'Dead letters + sweeper'],
                            ['Auth', 'JWT, rotating refresh'],
                            ['Source', 'GitHub'],
                        ].map(([k, v]) => (
                            <div key={k} className="bg-card px-4 py-3">
                                <dt className="label mb-1">{k}</dt>
                                <dd className="font-medium text-ink">
                                    {k === 'Source' ? (
                                        <a href={REPO} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
                                            Olayanju-1234/liftoff <ArrowUpRight size={12} />
                                        </a>
                                    ) : (
                                        v
                                    )}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </section>

            <section className="border-t border-rule bg-paper/70">
                <div className="mx-auto max-w-[1240px] px-4 py-14 sm:px-6 lg:px-10">
                    <div className="flex flex-col items-start gap-5 rounded-md border border-ink bg-ink px-6 py-7 text-paper sm:flex-row sm:items-center sm:px-8">
                        <div className="flex-1">
                            <p className="font-cond text-[28px] font-semibold uppercase leading-none tracking-[0.01em]">Your next customer, onboarded in four seconds.</p>
                            <p className="mt-2 text-[15px] text-paper/70">Create a free account, provision a test customer, and watch the ticket fill in.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Link
                                to={primaryTo}
                                className="inline-flex h-11 items-center gap-3 rounded bg-ignite pl-5 pr-4 text-[15px] font-medium text-card transition-colors hover:bg-ignite/90"
                            >
                                {primaryLabel} <ArrowRight size={16} />
                            </Link>
                            <Link to="/docs" className="inline-flex h-11 items-center rounded border border-paper/30 px-4 text-[15px] font-medium text-paper hover:bg-paper/10">
                                Docs
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </SiteShell>
    );
}

function Step({ n, title, tag, children }: { n: string; title: string; tag?: React.ReactNode; children: React.ReactNode }) {
    return (
        <article className="flex min-w-0 flex-col rounded-md border border-rule bg-card p-5 shadow-sheet">
            <div className="mb-3 flex items-center gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-sm border-[1.5px] border-ink font-mark text-[11px]">{n}</span>
                <h3 className="font-cond text-[22px] font-semibold leading-tight">{title}</h3>
                {tag && <span className="ml-auto">{tag}</span>}
            </div>
            <div className="text-[14.5px] leading-relaxed text-ink-2">{children}</div>
        </article>
    );
}

function Note({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
    return (
        <article className="rounded-md border border-rule bg-card p-5 shadow-sheet">
            <div className="mb-3 flex items-center gap-3">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-ink font-mono text-[12px] font-medium">{n}</span>
                <h3 className="font-cond text-[21px] font-semibold leading-tight">{title}</h3>
            </div>
            <div className="text-[14.5px] leading-relaxed text-ink-2">{children}</div>
        </article>
    );
}
