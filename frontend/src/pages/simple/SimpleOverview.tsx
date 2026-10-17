import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceStrict } from 'date-fns';
import { ChevronRight, Plus, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { getTenants } from '../../lib/api';
import { useNow, useResource } from '../../lib/hooks';
import { condition } from '../../lib/pipeline';
import { SIMPLE_STATUS, simpleStatus, tenantHost } from '../../lib/simple';
import type { SimpleStatus } from '../../lib/simple';
import { fmtStamp } from '../../lib/time';
import type { Tenant } from '../../lib/types';
import { cn } from '../../lib/cn';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import Button from '../../components/ui/Button';
import Empty from '../../components/ui/Empty';
import { Tag } from '../../components/ui/Tag';
import CreateTenantModal from '../../components/CreateTenantModal';
import LoadError from '../../components/LoadError';

const ORDER: SimpleStatus[] = ['attention', 'setting-up', 'ready', 'cancelled'];

export default function SimpleOverview() {
    const navigate = useNavigate();
    const now = useNow();
    const [createOpen, setCreateOpen] = useState(false);
    const tenants = useResource(getTenants, { interval: 10_000 });

    const list = tenants.data ?? [];
    const rows = list
        .map((t) => ({ t, s: simpleStatus(condition(t, now)) }))
        .sort((a, b) => ORDER.indexOf(a.s) - ORDER.indexOf(b.s) || Date.parse(b.t.createdAt) - Date.parse(a.t.createdAt));
    const count = (s: SimpleStatus) => rows.filter((r) => r.s === s).length;

    const parts = [
        count('ready') ? `${count('ready')} ready` : null,
        count('setting-up') ? `${count('setting-up')} setting up` : null,
        count('attention') ? `${count('attention')} need${count('attention') === 1 ? 's' : ''} attention` : null,
    ].filter(Boolean);
    const lede = tenants.loading
        ? 'Loading your tenants…'
        : list.length === 0
          ? 'You have no tenants yet.'
          : `${list.length} tenant${list.length === 1 ? '' : 's'}${parts.length ? ` · ${parts.join(' · ')}` : ''}.`;

    return (
        <>
            <CreateTenantModal
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={(t) => {
                    setCreateOpen(false);
                    toast.success(`Setting up ${t.name}`);
                    navigate(`/tenants/${t.id}`);
                }}
            />

            <PageHeader
                eyebrow="Overview"
                title="Your tenants"
                lede={lede}
                actions={
                    <>
                        <Button onClick={tenants.refresh} busy={tenants.refreshing} aria-label="Refresh">
                            {!tenants.refreshing && <RotateCcw size={14} />}
                            Refresh
                        </Button>
                        <Button variant="primary" onClick={() => setCreateOpen(true)}>
                            <Plus size={15} /> New tenant
                        </Button>
                    </>
                }
            />

            {tenants.error !== null && !tenants.data && (
                <LoadError error={tenants.error} what="your tenants" onRetry={tenants.refresh} busy={tenants.refreshing} />
            )}

            <Panel flush>
                <div className="hidden grid-cols-[minmax(0,1.3fr)_150px_minmax(0,1.3fr)_150px_24px] items-end gap-4 border-b border-ink/70 bg-paper-deep/50 px-5 pb-2 pt-2.5 md:grid">
                    <span className="label">Tenant</span>
                    <span className="label">Status</span>
                    <span className="label">Address</span>
                    <span className="label">Created</span>
                    <span />
                </div>

                {tenants.loading ? (
                    <div className="space-y-px">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="h-[64px] animate-pulse border-b border-rule bg-paper/40" />
                        ))}
                    </div>
                ) : rows.length === 0 ? (
                    <Empty
                        title="No tenants yet"
                        action={
                            <Button variant="primary" onClick={() => setCreateOpen(true)}>
                                <Plus size={15} /> Create your first tenant
                            </Button>
                        }
                    >
                        Give it a name and an address. Setup usually takes less than a minute.
                    </Empty>
                ) : (
                    <ul className="divide-y divide-rule">
                        {rows.map(({ t, s }) => (
                            <Row key={t.id} tenant={t} status={s} now={now} />
                        ))}
                    </ul>
                )}
                {!tenants.loading && rows.length > 0 && (
                    <p className="border-t border-rule px-5 py-2.5 text-[12.5px] text-ink-3">Updates automatically every 10 seconds.</p>
                )}
            </Panel>
        </>
    );
}

function Row({ tenant, status, now }: { tenant: Tenant; status: SimpleStatus; now: number }) {
    const meta = SIMPLE_STATUS[status];
    const created = Date.parse(tenant.createdAt);
    return (
        <li>
            <Link
                to={`/tenants/${tenant.id}`}
                className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3.5 transition-colors hover:bg-paper/70 sm:px-5 md:grid-cols-[minmax(0,1.3fr)_150px_minmax(0,1.3fr)_150px_24px]"
            >
                <span className="min-w-0">
                    <span className="block truncate text-[15.5px] font-semibold text-ink group-hover:underline">{tenant.name}</span>
                    <span className="block truncate text-[12.5px] text-ink-3 md:hidden">{tenantHost(tenant.subdomain)}</span>
                </span>
                <span className="justify-self-end md:justify-self-start">
                    <Tag tone={meta.tone} live={meta.live}>
                        {meta.label}
                    </Tag>
                </span>
                <span className="hidden min-w-0 truncate font-mono text-[12.5px] text-ink-2 md:block" title={tenantHost(tenant.subdomain)}>
                    {tenantHost(tenant.subdomain)}
                </span>
                <span className={cn('col-span-2 text-[12.5px] text-ink-3 md:col-span-1 md:text-[13px]')} title={fmtStamp(created)}>
                    <span className="md:hidden">Created </span>
                    {formatDistanceStrict(created, now, { addSuffix: true })}
                </span>
                <ChevronRight size={15} className="hidden text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-ink md:block" />
            </Link>
        </li>
    );
}
