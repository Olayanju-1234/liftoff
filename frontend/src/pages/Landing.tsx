import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { DLX, EXCHANGE, STAGES, STALL_AFTER_MS } from '../lib/pipeline';
import { buttonClass } from '../lib/ui';
import { useNow } from '../lib/hooks';
import type { Tenant } from '../lib/types';
import { Wordmark } from '../components/ui/Brand';
import DemoSequence from '../components/pipeline/DemoSequence';
import SequenceTrack from '../components/pipeline/SequenceTrack';
import { cn } from '../lib/cn';

const REPO = 'https://github.com/Olayanju-1234/liftoff';

const SPEC: [string, string][] = [
    ['Services', '7 × NestJS'],
    ['Transport', 'RabbitMQ direct exchange'],
    ['Failures', 'Dead-letter exchange + sweeper'],
    ['Isolation', 'Postgres schema per tenant'],
    ['Billing', 'Stripe, 14-day trial'],
    ['Auth', 'JWT, rotating refresh tokens'],
];

const BOM: [string, string, string, string][] = [
    ['01', '1', 'api-gateway', 'Single entry point. Per-IP rate limits, JWT forwarding, Pino request logs, Swagger at /api/docs.'],
    ['02', '1', 'tenant-service', 'Tenants, auth and saga state. Mirrors every *.ready event into per-step status; sweeps stuck pipelines.'],
    ['03', '5', 'workers', 'db-provisioner, dns-provisioner, credentials, billing, notification. One queue each, one job each.'],
    ['04', '1', 'RabbitMQ', `${EXCHANGE} for the saga, ${DLX} for rejected messages, prefetch 10 per consumer.`],
    ['05', '1', 'PostgreSQL', 'public and credentials schemas, plus one tenant_<subdomain> schema per tenant.'],
    ['06', '1', 'Stripe', 'Customer and subscription per tenant. Billing refuses to boot if a plan price is missing.'],
    ['07', '1', 'This dashboard', 'React 19, Vite and Tailwind. Polls the gateway and replays new events on the wiring diagram.'],
];

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

    return (
        <div className="drafting min-h-screen">
            <header className="border-b border-rule bg-paper/80 backdrop-blur">
                <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-6 px-4 sm:px-6 lg:px-10">
                    <Link to="/" aria-label="Liftoff home">
                        <Wordmark />
                    </Link>
                    <nav className="hidden items-center gap-6 text-[14px] font-medium text-ink-2 md:flex" aria-label="Sections">
                        <a href="#sequence" className="hover:text-ink">
                            The sequence
                        </a>
                        <a href="#failures" className="hover:text-ink">
                            Failure handling
                        </a>
                        <a href="#parts" className="hover:text-ink">
                            Parts list
                        </a>
                        <a href={REPO} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-ink">
                            GitHub <ArrowUpRight size={14} />
                        </a>
                    </nav>
                    <div className="ml-auto flex items-center gap-2">
                        {isAuthenticated ? (
                            <Link to="/" className={buttonClass('primary', 'sm')}>
                                Open dashboard <ArrowRight size={14} />
                            </Link>
                        ) : (
                            <>
                                <Link to="/login" className={buttonClass('ghost', 'sm')}>
                                    Sign in
                                </Link>
                                <Link to="/register" className={buttonClass('primary', 'sm')}>
                                    Create workspace
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <main>
                <section className="mx-auto grid max-w-[1240px] gap-10 px-4 pb-12 pt-12 sm:px-6 md:pt-16 lg:grid-cols-12 lg:px-10">
                    <div className="lg:col-span-8">
                        <p className="label mb-5 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="text-ink">B2B tenant provisioning</span>
                            <span aria-hidden className="h-px w-8 bg-rule-strong" />
                            <span>Choreography saga over RabbitMQ</span>
                        </p>
                        <h1 className="font-cond text-[46px] font-bold uppercase leading-[0.9] tracking-[-0.005em] text-ink sm:text-[64px] lg:text-[78px]">
                            Sign up a tenant.
                            <br />
                            Watch seven services
                            <br />
                            <span className="relative">
                                bring it online
                                <span aria-hidden className="anim-blink ml-1 inline-block h-[0.62em] w-[0.36em] translate-y-[-0.04em] bg-ignite" />
                            </span>
                        </h1>
                        <p className="mt-7 max-w-[640px] text-[17px] leading-relaxed text-ink-2">
                            Liftoff turns one <code className="font-mono text-[15px] text-ink">POST /tenants</code> into a chain of
                            events. Five workers each own one job: a Postgres schema, a DNS record, an API key, a Stripe
                            subscription and a welcome email. They hand off over a single exchange with no orchestrator in the
                            middle. When a step fails, the message is dead-lettered, the stage is flagged within a minute, and a
                            sweeper cancels the tenant if nothing moves.
                        </p>
                        <div className="mt-8 flex flex-wrap items-center gap-3">
                            <Link
                                to={isAuthenticated ? '/' : '/register'}
                                className={cn(buttonClass('primary', 'md'), 'h-11 pl-5 pr-1.5 text-[15px]')}
                            >
                                {isAuthenticated ? 'Open the dashboard' : 'Create a workspace'}
                                <span className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-sm bg-ignite text-card">
                                    <ArrowRight size={16} />
                                </span>
                            </Link>
                            <a href={REPO} target="_blank" rel="noreferrer" className={cn(buttonClass('secondary', 'md'), 'h-11')}>
                                Read the source <ArrowUpRight size={15} />
                            </a>
                        </div>
                    </div>

                    <aside className="self-end lg:col-span-4" aria-label="Specification">
                        <div className="crop rounded-md border border-ink/70 bg-card">
                            <div className="flex items-center justify-between border-b border-ink/70 px-4 py-2">
                                <span className="label text-ink">Spec</span>
                                <span className="font-mono text-[10.5px] text-ink-3">DWG LO-001 · REV C</span>
                            </div>
                            <dl className="divide-y divide-rule">
                                {SPEC.map(([k, v]) => (
                                    <div key={k} className="grid grid-cols-[96px_1fr] gap-3 px-4 py-2.5">
                                        <dt className="label pt-px">{k}</dt>
                                        <dd className="text-[14px] font-medium text-ink">{v}</dd>
                                    </div>
                                ))}
                            </dl>
                        </div>
                    </aside>
                </section>

                <section className="mx-auto max-w-[1240px] px-4 pb-16 sm:px-6 lg:px-10" aria-label="Live demonstration">
                    <div className="crop rounded-md border border-rule-strong bg-card shadow-lift">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule px-4 pb-3 pt-4 sm:px-5">
                            <span className="label">Fig. 1</span>
                            <h2 className="font-cond text-[22px] font-semibold leading-tight">One signup, end to end</h2>
                            <span className="text-[14px] text-ink-3">
                                Packets carry their routing keys. Inject a failure to see where it lands.
                            </span>
                        </div>
                        <DemoSequence />
                    </div>
                </section>

                <section id="sequence" className="border-t border-rule bg-paper/70">
                    <div className="mx-auto max-w-[1240px] px-4 py-16 sm:px-6 lg:px-10">
                        <SectionHead
                            sheet="02"
                            title="The sequence"
                            lede="Each worker consumes one routing key and publishes the next. tenant-service listens to all of them and keeps the per-step status the dashboard draws."
                        />
                        <div className="overflow-hidden rounded-md border border-ink/70 bg-card">
                            <div className="hidden grid-cols-[56px_1.1fr_1.25fr_1.45fr_1.4fr_1.2fr] gap-4 border-b border-ink/70 bg-paper-deep/60 px-5 py-2.5 lg:grid">
                                {['Stage', 'Service / queue', 'Consumes', 'Does', 'Emits', 'On failure'].map((h) => (
                                    <span key={h} className="label">
                                        {h}
                                    </span>
                                ))}
                            </div>
                            <ol className="divide-y divide-rule">
                                {STAGES.map((s) => (
                                    <li
                                        key={s.key}
                                        className="grid gap-x-4 gap-y-1.5 px-5 py-4 lg:grid-cols-[56px_1.1fr_1.25fr_1.45fr_1.4fr_1.2fr] lg:items-baseline"
                                    >
                                        <span className="font-mark text-[12px] tracking-[0.12em] text-ink">{s.code}</span>
                                        <span>
                                            <span className="block font-mono text-[13.5px] font-medium text-ink">{s.service}</span>
                                            <span className="block font-mono text-[11.5px] text-ink-3">{s.queue}</span>
                                        </span>
                                        <Key label="Consumes">{s.consumes}</Key>
                                        <span className="text-[14.5px] text-ink-2">{s.detail}</span>
                                        <Key label="Emits" tone="text-blueprint">
                                            {s.emits}
                                        </Key>
                                        <Key label="On failure" tone="text-abort">
                                            {s.deadLetterKey}
                                        </Key>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    </div>
                </section>

                <section id="failures" className="border-t border-rule">
                    <div className="mx-auto max-w-[1240px] px-4 py-16 sm:px-6 lg:px-10">
                        <SectionHead
                            sheet="03"
                            title="When a step fails"
                            lede="Distributed sagas fail in the middle. These are the rules that keep a half-provisioned tenant visible and bounded."
                        />
                        <div className="grid gap-5 md:grid-cols-3">
                            <Note n="1" title="Reject, don't loop">
                                <p>
                                    A worker that can't finish returns <Code>Nack(requeue=false)</Code>. RabbitMQ re-routes the
                                    message to <Code tone="text-abort">{DLX}</Code> with the key <Code>&lt;service&gt;.failed</Code>
                                    instead of redelivering it in a loop.
                                </p>
                                <svg viewBox="0 0 240 70" className="mt-5 w-full" aria-hidden>
                                    <rect x="70" y="4" width="100" height="30" rx="3" className="fill-abort/[0.06] stroke-abort" strokeWidth="1.5" />
                                    <text x="120" y="23" textAnchor="middle" className="fill-abort font-mono text-[10px] font-medium">
                                        billing · NACK
                                    </text>
                                    <line x1="120" y1="34" x2="120" y2="58" className="stroke-abort" strokeWidth="1.5" strokeDasharray="3 3" />
                                    <line x1="10" y1="58" x2="230" y2="58" className="stroke-abort" strokeWidth="1.5" strokeDasharray="7 4" />
                                    <circle cx="120" cy="58" r="4" className="fill-abort" />
                                    <text x="128" y="50" className="fill-abort font-mono text-[9px]">
                                        billing.failed
                                    </text>
                                </svg>
                            </Note>
                            <Note n="2" title="Stalls show up in a minute">
                                <p>
                                    The step stays <Code>IN_PROGRESS</Code>, so the dashboard flags any stage with no progress for 60
                                    seconds and names the queue and dead-letter key involved.
                                </p>
                                <div className="mt-5 flex items-center gap-3">
                                    <SequenceTrack
                                        tenant={sampleTenant({ credentialsStatus: 'IN_PROGRESS', updatedAt: stalledAgo }, now)}
                                        now={now}
                                        size="md"
                                        labels
                                    />
                                    <span className="font-mono text-[11px] font-medium text-hold">KEY · 74 s quiet</span>
                                </div>
                            </Note>
                            <Note n="3" title="Nothing provisions forever">
                                <p>
                                    tenant-service sweeps every five minutes and cancels pipelines that have been stuck for 30, marking
                                    unfinished steps <Code>CANCELLED</Code> with a reason. Operators can cancel sooner from the board.
                                </p>
                                <div className="mt-5 flex items-center gap-3">
                                    <SequenceTrack
                                        tenant={sampleTenant(
                                            {
                                                status: 'CANCELLED',
                                                credentialsStatus: 'CANCELLED',
                                                billingStatus: 'CANCELLED',
                                                notificationStatus: 'CANCELLED',
                                            },
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
                    </div>
                </section>

                <section id="parts" className="border-t border-rule bg-paper/70">
                    <div className="mx-auto max-w-[1240px] px-4 py-16 sm:px-6 lg:px-10">
                        <SectionHead sheet="04" title="Parts list" lede="Everything that runs when a tenant signs up." />
                        <div className="overflow-hidden rounded-md border border-ink/70 bg-card">
                            <div className="hidden grid-cols-[56px_56px_200px_1fr] gap-4 border-b border-ink/70 bg-paper-deep/60 px-5 py-2.5 md:grid">
                                {['Item', 'Qty', 'Part', 'Note'].map((h) => (
                                    <span key={h} className="label">
                                        {h}
                                    </span>
                                ))}
                            </div>
                            <ul className="divide-y divide-rule">
                                {BOM.map(([item, qty, part, note]) => (
                                    <li key={item} className="grid grid-cols-[40px_1fr] gap-x-4 gap-y-1 px-5 py-3.5 md:grid-cols-[56px_56px_200px_1fr] md:items-baseline">
                                        <span className="num font-mono text-[12px] text-ink-3">{item}</span>
                                        <span className="num hidden font-mono text-[13px] text-ink md:block">× {qty}</span>
                                        <span className="font-mono text-[13.5px] font-medium text-ink">
                                            {part}
                                            <span className="text-ink-3 md:hidden"> × {qty}</span>
                                        </span>
                                        <span className="col-start-2 text-[14.5px] text-ink-2 md:col-start-auto">{note}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="mt-12 flex flex-col items-start gap-5 rounded-md border border-ink bg-ink px-6 py-7 text-paper sm:flex-row sm:items-center sm:px-8">
                            <div className="flex-1">
                                <p className="font-cond text-[28px] font-semibold uppercase leading-none tracking-[0.01em]">
                                    Ready when you are.
                                </p>
                                <p className="mt-2 text-[15px] text-paper/70">
                                    Create a workspace, provision a tenant, and watch the board fill in.
                                </p>
                            </div>
                            <Link
                                to={isAuthenticated ? '/' : '/register'}
                                className="inline-flex h-11 items-center gap-3 rounded bg-ignite pl-5 pr-4 text-[15px] font-medium text-card transition-colors hover:bg-ignite/90"
                            >
                                {isAuthenticated ? 'Open the dashboard' : 'Create a workspace'} <ArrowRight size={16} />
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="border-t border-ink/80 bg-card">
                <div className="mx-auto grid max-w-[1240px] grid-cols-2 border-x border-rule text-[13px] md:grid-cols-5">
                    {[
                        ['Drawing', 'Liftoff provisioning control'],
                        ['Drawn by', 'Joseph Olayanju'],
                        ['Source', 'github.com/Olayanju-1234/liftoff'],
                        ['Revision', '2026.10'],
                        ['Sheet', '1 of 1'],
                    ].map(([k, v]) => (
                        <div key={k} className="border-b border-r border-rule px-4 py-3 last:border-r-0 md:border-b-0">
                            <p className="label mb-1">{k}</p>
                            {k === 'Source' ? (
                                <a href={REPO} target="_blank" rel="noreferrer" className="link break-all font-mono text-[12px]">
                                    {v}
                                </a>
                            ) : (
                                <p className="font-medium text-ink">{v}</p>
                            )}
                        </div>
                    ))}
                </div>
            </footer>
        </div>
    );
}

function SectionHead({ sheet, title, lede }: { sheet: string; title: string; lede: string }) {
    return (
        <div className="mb-8 grid gap-3 border-b-2 border-ink pb-5 md:grid-cols-12 md:items-end">
            <div className="md:col-span-5">
                <p className="label mb-2">Sheet {sheet}</p>
                <h2 className="font-cond text-[40px] font-semibold uppercase leading-[0.95] tracking-[0.005em] text-ink">{title}</h2>
            </div>
            <p className="max-w-xl text-[16px] text-ink-2 md:col-span-7">{lede}</p>
        </div>
    );
}

function Key({ label, tone = 'text-ink-2', children }: { label: string; tone?: string; children: string }) {
    return (
        <span className="flex items-baseline gap-2">
            <span className="label w-[84px] shrink-0 lg:hidden">{label}</span>
            <code className={`font-mono text-[12px] [overflow-wrap:anywhere] ${tone}`}>{children}</code>
        </span>
    );
}

function Code({ children, tone = 'text-ink' }: { children: React.ReactNode; tone?: string }) {
    return <code className={`rounded-sm bg-paper-deep px-1 py-px font-mono text-[12.5px] ${tone}`}>{children}</code>;
}

function Note({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
    return (
        <article className="rounded-md border border-rule bg-card p-5 shadow-sheet">
            <div className="mb-3 flex items-center gap-3">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-ink font-mono text-[12px] font-medium">
                    {n}
                </span>
                <h3 className="font-cond text-[21px] font-semibold leading-tight">{title}</h3>
            </div>
            <div className="text-[14.5px] leading-relaxed text-ink-2">{children}</div>
        </article>
    );
}
