import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Ban, ChevronRight, Plus, Search, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { getTenants } from '../lib/api';
import { useNow, useResource } from '../lib/hooks';
import { useTenantActions } from '../lib/useTenantActions';
import { STAGES, condition, planLabel } from '../lib/pipeline';
import type { Condition } from '../lib/pipeline';
import { fmtAgo, fmtStamp } from '../lib/time';
import { inputClass } from '../lib/ui';
import type { Tenant } from '../lib/types';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import Button from '../components/ui/Button';
import Empty from '../components/ui/Empty';
import { Segmented } from '../components/ui/Field';
import { ConditionTag, Tag } from '../components/ui/Tag';
import SequenceTrack from '../components/pipeline/SequenceTrack';
import CreateTenantModal from '../components/CreateTenantModal';
import LoadError from '../components/LoadError';
import { cn } from '../lib/cn';

type Filter = 'all' | 'active' | 'inflight' | 'stalled' | 'failed' | 'cancelled';

const FILTER_MATCH: Record<Filter, Condition[]> = {
    all: [],
    active: ['active'],
    inflight: ['running', 'waiting'],
    stalled: ['stalled'],
    failed: ['failed'],
    cancelled: ['cancelled', 'suspended', 'removing'],
};

const TRACK_X = (i: number) => 10 + i * 24;

export default function TenantManagement() {
    const navigate = useNavigate();
    const now = useNow();
    const [createOpen, setCreateOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('all');
    const [plan, setPlan] = useState('all');
    const tenants = useResource(getTenants, { interval: 10_000 });
    const actions = useTenantActions({ onCancelled: tenants.refresh, onDeleted: tenants.refresh });

    const list = useMemo(() => tenants.data ?? [], [tenants.data]);
    const plans = useMemo(() => Array.from(new Set(list.map((t) => t.planId))).sort(), [list]);
    const withCond = list.map((t) => ({ t, c: condition(t, now) }));

    const counts = Object.fromEntries(
        (Object.keys(FILTER_MATCH) as Filter[]).map((f) => [
            f,
            f === 'all' ? list.length : withCond.filter((x) => FILTER_MATCH[f].includes(x.c)).length,
        ]),
    ) as Record<Filter, number>;

    const q = query.trim().toLowerCase();
    const rows = withCond.filter(({ t, c }) => {
        if (filter !== 'all' && !FILTER_MATCH[filter].includes(c)) return false;
        if (plan !== 'all' && t.planId !== plan) return false;
        if (q && !t.name.toLowerCase().includes(q) && !t.subdomain.toLowerCase().includes(q) && !t.id.includes(q)) return false;
        return true;
    });

    return (
        <>
            {actions.dialog}
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
                sheet="02"
                eyebrow="Tenants"
                title="Tenants"
                lede="Every tenant on the platform and how far through the sequence it got."
                actions={
                    <Button variant="primary" onClick={() => setCreateOpen(true)}>
                        <Plus size={15} /> New tenant
                    </Button>
                }
            />

            {tenants.error !== null && !tenants.data && (
                <LoadError error={tenants.error} what="tenants" onRetry={tenants.refresh} busy={tenants.refreshing} />
            )}

            <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Name, subdomain or ID"
                        aria-label="Search tenants"
                        className={cn(inputClass, 'pl-9 pr-9')}
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => setQuery('')}
                            aria-label="Clear search"
                            className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-ink-3 hover:text-ink"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
                <Segmented<Filter>
                    label="Filter by state"
                    value={filter}
                    onChange={setFilter}
                    options={[
                        { value: 'all', label: 'All', count: counts.all },
                        { value: 'active', label: 'Active', count: counts.active },
                        { value: 'inflight', label: 'In flight', count: counts.inflight },
                        { value: 'stalled', label: 'Stalled', count: counts.stalled },
                        { value: 'failed', label: 'Failed', count: counts.failed },
                        { value: 'cancelled', label: 'Cancelled', count: counts.cancelled },
                    ]}
                />
                <select
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                    aria-label="Filter by plan"
                    className={cn(inputClass, 'w-auto min-w-[140px] pr-8 font-mono text-[13px]')}
                >
                    <option value="all">All plans</option>
                    {plans.map((p) => (
                        <option key={p} value={p}>
                            {p}
                        </option>
                    ))}
                </select>
            </div>

            <Panel flush>
                <div className="hidden grid-cols-[minmax(0,1.4fr)_150px_130px_minmax(0,0.8fr)_120px_92px] items-end gap-4 border-b border-ink/70 bg-paper-deep/50 px-5 pb-2 pt-2.5 md:grid">
                    <span className="label">Tenant</span>
                    <span className="relative h-[15px]" aria-hidden>
                        {[...STAGES.map((s) => s.short), 'GO'].map((label, i) => (
                            <span key={label} className="label absolute top-0 -translate-x-1/2 text-[9.5px]" style={{ left: TRACK_X(i) }}>
                                {label}
                            </span>
                        ))}
                    </span>
                    <span className="label">State</span>
                    <span className="label">Plan</span>
                    <span className="label">Created</span>
                    <span />
                </div>

                {tenants.loading ? (
                    <div className="space-y-px">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="h-[61px] animate-pulse border-b border-rule bg-paper/40" />
                        ))}
                    </div>
                ) : rows.length === 0 ? (
                    <Empty
                        title={list.length === 0 ? 'No tenants yet' : 'Nothing matches'}
                        action={
                            list.length === 0 ? (
                                <Button variant="primary" onClick={() => setCreateOpen(true)}>
                                    <Plus size={15} /> Provision the first one
                                </Button>
                            ) : (
                                <Button
                                    onClick={() => {
                                        setQuery('');
                                        setFilter('all');
                                        setPlan('all');
                                    }}
                                >
                                    Clear filters
                                </Button>
                            )
                        }
                    >
                        {list.length === 0 ? 'A new tenant runs through five stages before it goes active.' : 'Try a different state or plan.'}
                    </Empty>
                ) : (
                    <ul className="divide-y divide-rule">
                        {rows.map(({ t, c }) => (
                            <Row key={t.id} tenant={t} cond={c} now={now} onCancel={actions.requestCancel} onDelete={actions.requestDelete} />
                        ))}
                    </ul>
                )}
                {!tenants.loading && rows.length > 0 && (
                    <p className="border-t border-rule px-5 py-2.5 font-mono text-[11px] text-ink-3">
                        {rows.length} of {list.length} shown · refreshes every 10 s
                    </p>
                )}
            </Panel>
        </>
    );
}

interface RowProps {
    tenant: Tenant;
    cond: Condition;
    now: number;
    onCancel: (t: Tenant) => void;
    onDelete: (t: Tenant) => void;
}

function Row({ tenant, cond, now, onCancel, onDelete }: RowProps) {
    const created = Date.parse(tenant.createdAt);
    return (
        <li className="group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-paper/70 sm:px-5 md:grid-cols-[minmax(0,1.4fr)_150px_130px_minmax(0,0.8fr)_120px_92px]">
            <Link to={`/tenants/${tenant.id}`} className="min-w-0 after:absolute after:inset-0">
                <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[15px] font-semibold text-ink group-hover:underline">{tenant.name}</span>
                    {tenant.isTest && (
                        <Tag tone="blueprint" title="Test tenant: billing SKIPPED, outside the quotas.">
                            Test
                        </Tag>
                    )}
                </span>
                <span className="block truncate font-mono text-[11.5px] text-ink-3">{tenant.subdomain}</span>
            </Link>
            <SequenceTrack tenant={tenant} now={now} className="hidden md:block" />
            <span className="justify-self-end md:justify-self-start">
                <ConditionTag condition={cond} />
            </span>
            <span className="hidden truncate font-mono text-[12.5px] text-ink-2 md:block">{planLabel(tenant)}</span>
            <span className="hidden font-mono text-[12px] text-ink-3 md:block" title={fmtStamp(created)}>
                {fmtAgo(created, now)}
            </span>
            <span className="relative z-10 col-span-2 flex items-center justify-between gap-1 md:col-span-1 md:justify-end">
                <SequenceTrack tenant={tenant} now={now} className="md:hidden" />
                <span className="flex items-center gap-1">
                    {tenant.status === 'PROVISIONING' && (
                        <IconButton label={`Cancel provisioning for ${tenant.name}`} onClick={() => onCancel(tenant)}>
                            <Ban size={14} />
                        </IconButton>
                    )}
                    <IconButton label={`Delete ${tenant.name}`} onClick={() => onDelete(tenant)} danger>
                        <Trash2 size={14} />
                    </IconButton>
                    <ChevronRight size={15} className="hidden text-ink-4 group-hover:text-ink md:block" />
                </span>
            </span>
        </li>
    );
}

function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={label}
            aria-label={label}
            className={`inline-flex h-8 w-8 items-center justify-center rounded border border-transparent text-ink-3 transition-colors hover:border-rule-strong hover:bg-card ${
                danger ? 'hover:text-abort' : 'hover:text-ink'
            }`}
        >
            {children}
        </button>
    );
}
