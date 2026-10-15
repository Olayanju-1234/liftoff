import { Link } from 'react-router-dom';
import { Ban } from 'lucide-react';
import { getTenants } from '../lib/api';
import { useNow, useResource } from '../lib/hooks';
import { useTenantActions } from '../lib/useTenantActions';
import { STAGES, activeStage, cancelReasonFrom, condition, failedStage, isSweeperCancel, quietFor } from '../lib/pipeline';
import type { Condition } from '../lib/pipeline';
import { fmtAgo, fmtDuration } from '../lib/time';
import type { Tenant } from '../lib/types';
import { cn } from '../lib/cn';
import PageHeader from '../components/ui/PageHeader';
import { ConditionTag } from '../components/ui/Tag';
import SequenceTrack from '../components/pipeline/SequenceTrack';
import LoadError from '../components/LoadError';

const DAY = 86_400_000;

interface Column {
    id: string;
    code: string;
    title: string;
    sub: string;
    tenants: { t: Tenant; c: Condition }[];
}

export default function Pipeline() {
    const now = useNow();
    const tenants = useResource(getTenants, { interval: 5000 });
    const actions = useTenantActions({ onCancelled: tenants.refresh, onDeleted: tenants.refresh });
    const list = (tenants.data ?? []).map((t) => ({ t, c: condition(t, now) }));

    const columns: Column[] = [
        {
            id: 'queued',
            code: 'S0',
            title: 'Requested',
            sub: 'waiting on tenant.requested',
            tenants: list.filter((x) => x.c === 'waiting'),
        },
        ...STAGES.map((s) => ({
            id: s.key,
            code: s.code,
            title: s.name,
            sub: s.queue,
            tenants: list.filter(
                ({ t, c }) => (c === 'running' || c === 'stalled' || c === 'failed') && (activeStage(t) ?? failedStage(t))?.key === s.key,
            ),
        })),
        {
            id: 'active',
            code: 'GO',
            title: 'Active, last 24 h',
            sub: 'provisioning.complete',
            tenants: list.filter(({ t, c }) => c === 'active' && now - Date.parse(t.updatedAt) < DAY),
        },
    ];

    const cancelled = list
        .filter(({ t, c }) => c === 'cancelled' && now - Date.parse(t.updatedAt) < DAY)
        .sort((a, b) => Date.parse(b.t.updatedAt) - Date.parse(a.t.updatedAt));

    const open = columns.slice(0, -1).reduce((n, col) => n + col.tenants.length, 0);

    return (
        <>
            {actions.dialog}
            <PageHeader
                sheet="03"
                eyebrow="Pipeline board"
                title="Pipeline board"
                lede="Every open tenant, filed under the stage that holds its message right now. Refreshes every five seconds."
                aside={
                    <p className="font-mono text-[12px] text-ink-3">
                        {open} open · {columns[columns.length - 1].tenants.length} went active today · {cancelled.length} cancelled today
                    </p>
                }
            />

            {tenants.error !== null && !tenants.data && (
                <LoadError error={tenants.error} what="the board" onRetry={tenants.refresh} busy={tenants.refreshing} />
            )}

            <div className="scrollbar-thin -mx-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
                <div className="grid min-w-[1060px] grid-cols-7 overflow-hidden rounded-md border border-ink/70 bg-rule" style={{ gap: 1 }}>
                    {columns.map((col, i) => (
                        <section key={col.id} className={cn('flex min-h-[420px] flex-col bg-card', i === 6 && 'shadow-[inset_0_3px_0_rgb(var(--go))]')}>
                            <header className="border-b border-rule px-3 pb-2.5 pt-3">
                                <div className="flex items-center justify-between">
                                    <span className="font-mark text-[10px] tracking-[0.12em] text-ink-2">{col.code}</span>
                                    <span
                                        className={cn(
                                            'num rounded-sm px-1.5 font-mono text-[11px] font-medium',
                                            col.tenants.length ? 'bg-ink text-paper' : 'text-ink-4',
                                        )}
                                    >
                                        {col.tenants.length}
                                    </span>
                                </div>
                                <h2 className="mt-1 font-cond text-[17px] font-semibold leading-tight text-ink">{col.title}</h2>
                                <p className="truncate font-mono text-[10.5px] text-ink-3">{col.sub}</p>
                            </header>
                            <ul className="flex-1 space-y-2 p-2">
                                {col.tenants.map(({ t, c }) => (
                                    <Card key={t.id} tenant={t} cond={c} now={now} onCancel={actions.requestCancel} />
                                ))}
                                {col.tenants.length === 0 && (
                                    <li className="mx-1 mt-1 rounded border border-dashed border-rule px-2 py-3 text-center font-mono text-[11px] text-ink-4">
                                        empty
                                    </li>
                                )}
                            </ul>
                        </section>
                    ))}
                </div>
            </div>

            <section className="mt-8">
                <div className="mb-3 flex items-baseline gap-3 border-b border-rule pb-2">
                    <span className="label">Scrubbed</span>
                    <h2 className="font-cond text-[19px] font-semibold">Cancelled in the last 24 hours</h2>
                </div>
                {cancelled.length === 0 ? (
                    <p className="font-mono text-[12px] text-ink-3">None.</p>
                ) : (
                    <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {cancelled.map(({ t }) => {
                            const reason = cancelReasonFrom(t);
                            return (
                                <li key={t.id}>
                                    <Link
                                        to={`/tenants/${t.id}`}
                                        className="flex items-center gap-3 rounded border border-rule bg-card px-3 py-2.5 transition-colors hover:border-ink-3"
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[14px] font-semibold text-ink">{t.name}</span>
                                            <span className="block truncate font-mono text-[11px] text-ink-3">
                                                {isSweeperCancel(reason) ? 'timeout sweeper' : reason ?? 'cancelled'} · {fmtAgo(Date.parse(t.updatedAt), now)}
                                            </span>
                                        </span>
                                        <SequenceTrack tenant={t} now={now} />
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </>
    );
}

function Card({ tenant, cond, now, onCancel }: { tenant: Tenant; cond: Condition; now: number; onCancel: (t: Tenant) => void }) {
    const quiet = quietFor(tenant, now);
    const tone =
        cond === 'stalled' ? 'border-hold/60 bg-hold/[0.05]' : cond === 'failed' ? 'border-abort/50 bg-abort/[0.04]' : cond === 'active' ? 'border-go/30' : 'border-rule-strong';
    return (
        <li className={cn('group relative rounded border bg-card px-2.5 pb-2 pt-2 shadow-sheet transition-colors hover:border-ink-3', tone)}>
            <Link to={`/tenants/${tenant.id}`} className="block after:absolute after:inset-0">
                <span className="block truncate text-[14px] font-semibold leading-tight text-ink">{tenant.name}</span>
                <span className="block truncate font-mono text-[10.5px] text-ink-3">{tenant.subdomain}</span>
            </Link>
            <div className="mt-2 flex items-center justify-between gap-2">
                {cond === 'running' ? (
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-ignite">
                        <span className="anim-ring inline-block h-1.5 w-1.5 rounded-full bg-ignite" />
                        {fmtDuration(quiet)}
                    </span>
                ) : cond === 'active' ? (
                    <span className="font-mono text-[11px] text-go">{fmtAgo(Date.parse(tenant.updatedAt), now)}</span>
                ) : cond === 'waiting' ? (
                    <span className="font-mono text-[11px] text-ink-3">{fmtDuration(quiet)} waiting</span>
                ) : (
                    <ConditionTag condition={cond} />
                )}
                {tenant.status === 'PROVISIONING' && (
                    <button
                        type="button"
                        onClick={() => onCancel(tenant)}
                        className="relative z-10 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-ink-3 opacity-70 transition hover:bg-paper-deep hover:text-abort group-hover:opacity-100"
                        title={`Cancel provisioning for ${tenant.name}`}
                        aria-label={`Cancel provisioning for ${tenant.name}`}
                    >
                        <Ban size={13} />
                    </button>
                )}
            </div>
            {cond === 'stalled' && <p className="mt-1.5 font-mono text-[10.5px] text-hold">{fmtDuration(quiet)} with no progress</p>}
        </li>
    );
}
