import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { checkHealth, getEvents, getTenants } from '../lib/api';
import { useNow, useResource } from '../lib/hooks';
import { EXCHANGE, STAGES, isStalled } from '../lib/pipeline';
import { fmtAgo, fmtClock } from '../lib/time';
import type { Tone } from '../lib/ui';
import { TONE_TEXT } from '../lib/ui';
import { cn } from '../lib/cn';
import type { EventLog, Tenant } from '../lib/types';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import Button from '../components/ui/Button';
import { Tag } from '../components/ui/Tag';

type Call = 'GO' | 'HOLD' | 'NO-GO' | 'NO SIGNAL';

const CALL_TONE: Record<Call, Tone> = { GO: 'go', HOLD: 'hold', 'NO-GO': 'abort', 'NO SIGNAL': 'scrub' };

interface Row {
    name: string;
    role: string;
    evidence: string;
    last: string;
    call: Call;
}

interface Sample {
    at: number;
    ms: number;
    ok: boolean;
}

export default function Health() {
    const now = useNow();
    const [history, setHistory] = useState<Sample[]>([]);

    const gateway = useResource(
        async () => {
            const res = await checkHealth();
            setHistory((h) => [...h, { at: Date.now(), ms: res.latency, ok: res.status === 'Operational' }].slice(-30));
            return res;
        },
        { interval: 10_000 },
    );
    const tenants = useResource(
        async () => {
            const start = performance.now();
            const data = await getTenants();
            return { data, ms: Math.round(performance.now() - start) };
        },
        { interval: 20_000 },
    );
    const events = useResource(getEvents, { interval: 20_000 });

    const refreshAll = () => {
        gateway.refresh();
        tenants.refresh();
        events.refresh();
    };

    const gw = gateway.data;
    const gwUp = gw?.status === 'Operational';
    const tenantList: Tenant[] = tenants.data?.data ?? [];
    const tenantsOk = !!tenants.data && tenants.error === null;
    const evList: EventLog[] = events.data ?? [];
    const lastOf = (type: string) => evList.find((e) => e.eventType === type);
    const newest = evList[0];

    const rows: Row[] = [
        {
            name: 'api-gateway',
            role: 'Entry point, rate limits, auth forwarding',
            evidence: 'GET /health',
            last: gw ? `${gw.latency} ms` : '—',
            call: !gw ? 'NO SIGNAL' : gwUp ? 'GO' : 'NO-GO',
        },
        {
            name: 'tenant-service',
            role: 'Tenants, auth, saga state, sweeper',
            evidence: 'GET /tenants through the gateway',
            last: tenants.data ? `${tenants.data.ms} ms` : '—',
            call: tenants.loading ? 'NO SIGNAL' : tenantsOk ? 'GO' : 'NO-GO',
        },
        {
            name: 'postgres',
            role: 'Tenant data and per-tenant schemas',
            evidence: 'tenant reads succeed',
            last: tenantsOk ? 'reading' : '—',
            call: tenants.loading ? 'NO SIGNAL' : tenantsOk ? 'GO' : 'NO-GO',
        },
        {
            name: 'rabbitmq',
            role: `${EXCHANGE} and its dead-letter exchange`,
            evidence: 'newest event that crossed the exchange',
            last: newest ? fmtAgo(Date.parse(newest.timestamp), now) : 'none in latest 200',
            call: newest ? 'GO' : 'NO SIGNAL',
        },
        ...STAGES.map((s): Row => {
            const heard = lastOf(s.emits);
            const stuck = tenantList.filter((t) => t[s.key] === 'IN_PROGRESS' && isStalled(t, now)).length;
            return {
                name: s.service,
                role: s.detail,
                evidence: `last ${s.emits}${stuck ? ` · ${stuck} stalled here` : ''}`,
                last: heard ? fmtAgo(Date.parse(heard.timestamp), now) : 'none in latest 200',
                call: stuck ? 'HOLD' : heard ? 'GO' : 'NO SIGNAL',
            };
        }),
    ];

    const tally = rows.reduce<Record<Call, number>>(
        (acc, r) => ({ ...acc, [r.call]: acc[r.call] + 1 }),
        { GO: 0, HOLD: 0, 'NO-GO': 0, 'NO SIGNAL': 0 },
    );
    const verdict: { tone: Tone; text: string } = !gw
        ? { tone: 'scrub', text: 'Polling the gateway…' }
        : !gwUp
          ? { tone: 'abort', text: 'No-go. The gateway is not answering.' }
          : tally.HOLD
            ? { tone: 'hold', text: `Hold. ${tally.HOLD} stage${tally.HOLD === 1 ? ' has' : 's have'} stalled tenants.` }
            : { tone: 'go', text: 'Go. The gateway answers and nothing is stuck.' };

    return (
        <>
            <PageHeader
                sheet="06"
                eyebrow="Services"
                title="Go / no-go poll"
                lede="Only the gateway exposes a health check to the browser. Every other service is judged by the evidence it leaves: the last event it produced, and whether any tenant is stuck at its stage."
                actions={
                    <Button onClick={refreshAll} busy={gateway.refreshing}>
                        {!gateway.refreshing && <RotateCcw size={14} />} Poll again
                    </Button>
                }
            />

            <section className="mb-6 grid gap-px overflow-hidden rounded-md border border-ink/70 bg-rule md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <div className="bg-card px-5 py-5">
                    <p className="label mb-2">Verdict</p>
                    <p className={cn('font-cond text-[30px] font-semibold uppercase leading-[1.05]', TONE_TEXT[verdict.tone])}>{verdict.text}</p>
                    <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12px] text-ink-3">
                        {(Object.keys(tally) as Call[]).map((c) => (
                            <span key={c}>
                                <span className={TONE_TEXT[CALL_TONE[c]]}>{c}</span> {tally[c]}
                            </span>
                        ))}
                    </p>
                </div>
                <div className="bg-card px-5 py-5">
                    <div className="mb-2 flex items-baseline justify-between">
                        <p className="label">Gateway latency</p>
                        <p className="font-mono text-[11px] text-ink-3">every 10 s while this page is open</p>
                    </div>
                    <Sparkline samples={history} />
                </div>
            </section>

            <Panel flush>
                <div className="hidden grid-cols-[170px_minmax(0,1.3fr)_minmax(0,1.2fr)_140px_110px] gap-4 border-b border-ink/70 bg-paper-deep/50 px-5 py-2.5 lg:grid">
                    {['Service', 'Role', 'Evidence', 'Last', 'Call'].map((h) => (
                        <span key={h} className="label">
                            {h}
                        </span>
                    ))}
                </div>
                <ul className="divide-y divide-rule">
                    {rows.map((r) => (
                        <li
                            key={r.name}
                            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 px-4 py-3 sm:px-5 lg:grid-cols-[170px_minmax(0,1.3fr)_minmax(0,1.2fr)_140px_110px] lg:items-center"
                        >
                            <span className="font-mono text-[13.5px] font-medium text-ink">{r.name}</span>
                            <span className="justify-self-end lg:order-last lg:justify-self-start">
                                <Tag tone={CALL_TONE[r.call]}>{r.call}</Tag>
                            </span>
                            <span className="col-span-2 text-[14px] text-ink-2 lg:col-span-1">{r.role}</span>
                            <span className="col-span-2 font-mono text-[12px] text-ink-3 lg:col-span-1">{r.evidence}</span>
                            <span className="num col-span-2 font-mono text-[12px] text-ink lg:col-span-1">{r.last}</span>
                        </li>
                    ))}
                </ul>
            </Panel>
        </>
    );
}

function Sparkline({ samples }: { samples: Sample[] }) {
    const w = 360;
    const h = 64;
    if (samples.length === 0) {
        return <div className="flex h-16 items-center font-mono text-[12px] text-ink-3">waiting for the first sample…</div>;
    }
    const max = Math.max(100, ...samples.map((s) => s.ms));
    const step = samples.length > 1 ? w / 29 : 0;
    const pts = samples.map((s, i) => ({ x: i * step, y: h - 6 - (s.ms / max) * (h - 14), s }));
    const last = samples[samples.length - 1];
    return (
        <div className="flex items-end gap-4">
            <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full max-w-[360px]" aria-label="Gateway latency history">
                <line x1="0" y1={h - 6} x2={w} y2={h - 6} className="stroke-rule" strokeWidth="1" />
                <polyline
                    points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                    className="fill-none stroke-ink"
                    strokeWidth="1.5"
                />
                {pts.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r="2.4" className={p.s.ok ? 'fill-ink' : 'fill-abort'} />
                ))}
            </svg>
            <div className="shrink-0 text-right">
                <p className="num font-mono text-[26px] font-medium leading-none text-ink">
                    {last.ms}
                    <span className="text-[13px] text-ink-3"> ms</span>
                </p>
                <p className="mt-1 font-mono text-[11px] text-ink-3">{fmtClock(last.at)}</p>
            </div>
        </div>
    );
}
