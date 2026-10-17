import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceStrict } from 'date-fns';
import { ArrowRight, ChevronRight, Plus, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { getTenants } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { useNow, useResource } from '../../lib/hooks';
import { HOOD_HOME } from '../../lib/mode';
import { condition, planLabel } from '../../lib/pipeline';
import { SIMPLE_STATUS, simpleStatus, tenantHost } from '../../lib/simple';
import type { SimpleStatus } from '../../lib/simple';
import { fmtStamp } from '../../lib/time';
import type { Tenant } from '../../lib/types';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import Button from '../../components/ui/Button';
import Empty from '../../components/ui/Empty';
import { Tag } from '../../components/ui/Tag';
import CreateTenantModal from '../../components/CreateTenantModal';
import LoadError from '../../components/LoadError';

const ORDER: SimpleStatus[] = ['attention', 'setting-up', 'ready', 'cancelled'];
const COLS = 'md:grid-cols-[minmax(0,1.3fr)_150px_minmax(0,1.3fr)_110px_140px_24px]';

export default function Customers() {
    const navigate = useNavigate();
    const now = useNow();
    const { user } = useAuth();
    const [createOpen, setCreateOpen] = useState(false);
    const tenants = useResource(getTenants, { interval: 10_000 });

    // Signing up gives the company a workspace tenant of its own; this list is for its customers only.
    const list = (tenants.data ?? []).filter((t) => t.id !== user?.tenantId);
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
        ? 'Loading your customers…'
        : list.length === 0
          ? 'Every customer you add is set up automatically and appears here.'
          : `${list.length} customer${list.length === 1 ? '' : 's'}${parts.length ? ` · ${parts.join(' · ')}` : ''}.`;

    return (
        <>
            <CreateTenantModal
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={(t) => {
                    setCreateOpen(false);
                    toast.success(`Setting up ${t.name}`);
                    navigate(`/customers/${t.id}`);
                }}
            />

            <PageHeader
                eyebrow="Onboarding"
                title="Customers"
                lede={lede}
                actions={
                    <>
                        <Button onClick={tenants.refresh} busy={tenants.refreshing} aria-label="Refresh">
                            {!tenants.refreshing && <RotateCcw size={14} />}
                            Refresh
                        </Button>
                        <Button variant="primary" onClick={() => setCreateOpen(true)}>
                            <Plus size={15} /> Add customer
                        </Button>
                    </>
                }
            />

            {tenants.error !== null && !tenants.data && (
                <LoadError error={tenants.error} what="your customers" onRetry={tenants.refresh} busy={tenants.refreshing} />
            )}

            <Panel flush>
                <div className={`hidden items-end gap-4 border-b border-ink/70 bg-paper-deep/50 px-5 pb-2 pt-2.5 md:grid ${COLS}`}>
                    <span className="label">Customer</span>
                    <span className="label">Status</span>
                    <span className="label">Address</span>
                    <span className="label">Plan</span>
                    <span className="label">Added</span>
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
                        title="No customers yet"
                        action={
                            <div className="flex flex-col items-center gap-3">
                                <Button variant="primary" onClick={() => setCreateOpen(true)}>
                                    <Plus size={15} /> Add your first customer
                                </Button>
                                <Link to={HOOD_HOME} className="inline-flex items-center gap-1 text-[13px] font-medium text-blueprint hover:underline">
                                    API details are under the hood for now <ArrowRight size={13} />
                                </Link>
                            </div>
                        }
                    >
                        Add your first customer, or connect your signup flow so new customers are set up automatically.
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
                to={`/customers/${tenant.id}`}
                className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3.5 transition-colors hover:bg-paper/70 sm:px-5 ${COLS}`}
            >
                <span className="min-w-0">
                    <span className="block truncate text-[15.5px] font-semibold text-ink group-hover:underline">{tenant.name}</span>
                    <span className="block truncate text-[12.5px] text-ink-3 md:hidden">{tenantHost(tenant)}</span>
                </span>
                <span className="justify-self-end md:justify-self-start">
                    <Tag tone={meta.tone} live={meta.live}>
                        {meta.label}
                    </Tag>
                </span>
                <span className="hidden min-w-0 truncate font-mono text-[12.5px] text-ink-2 md:block" title={tenantHost(tenant)}>
                    {tenantHost(tenant)}
                </span>
                <span className="hidden text-[13px] text-ink-2 md:block">{planLabel(tenant)}</span>
                <span className="col-span-2 text-[12.5px] text-ink-3 md:col-span-1 md:text-[13px]" title={fmtStamp(created)}>
                    <span className="md:hidden">{planLabel(tenant)} · Added </span>
                    {formatDistanceStrict(created, now, { addSuffix: true })}
                </span>
                <ChevronRight size={15} className="hidden text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-ink md:block" />
            </Link>
        </li>
    );
}
