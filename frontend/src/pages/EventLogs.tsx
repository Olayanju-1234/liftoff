import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { getEvents } from '../lib/api';
import { useEventFeed } from '../lib/feed';
import { eventErrorText, eventLabel, stageForEvent } from '../lib/pipeline';
import { EVENT_TONE, inputClass } from '../lib/ui';
import { cn } from '../lib/cn';
import type { EventLog } from '../lib/types';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import Button from '../components/ui/Button';
import Empty from '../components/ui/Empty';
import { Segmented, Toggle } from '../components/ui/Field';
import { Tag } from '../components/ui/Tag';
import PayloadView from '../components/PayloadView';
import LoadError from '../components/LoadError';

type StatusFilter = 'all' | 'Success' | 'Warning' | 'Error';

export default function EventLogs() {
    const [tail, setTail] = useState(true);
    const feed = useEventFeed(getEvents, { interval: tail ? 4000 : undefined });
    const [tenant, setTenant] = useState('all');
    const [type, setType] = useState('all');
    const [status, setStatus] = useState<StatusFilter>('all');
    const [open, setOpen] = useState<string | null>(null);

    const events = useMemo(() => feed.data ?? [], [feed.data]);
    const tenants = useMemo(() => {
        const m = new Map<string, string>();
        events.forEach((e) => m.set(e.tenantId, e.tenant?.name ?? e.tenantId.slice(0, 8)));
        return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    }, [events]);
    const types = useMemo(() => [...new Set(events.map((e) => e.eventType))].sort(), [events]);

    const base = events.filter((e) => (tenant === 'all' || e.tenantId === tenant) && (type === 'all' || e.eventType === type));
    const rows = base.filter((e) => status === 'all' || e.status === status);
    const statusCount = (s: StatusFilter) => (s === 'all' ? base.length : base.filter((e) => e.status === s).length);

    const dayOf = (e: EventLog) => format(Date.parse(e.timestamp), 'EEEE d MMMM yyyy');

    return (
        <>
            <PageHeader
                sheet="04"
                eyebrow="Event log"
                title="Event log"
                lede="What tenant-service recorded as each message crossed the exchange. The API returns the latest 200."
                actions={
                    <>
                        <label className="mr-2 inline-flex items-center gap-2.5 text-[14px] font-medium text-ink-2">
                            <Toggle checked={tail} onChange={setTail} label="Live tail" />
                            Live tail
                            {tail && <span className="anim-ring inline-block h-1.5 w-1.5 rounded-full bg-go" />}
                        </label>
                        <Button onClick={feed.refresh} busy={feed.refreshing}>
                            {!feed.refreshing && <RotateCcw size={14} />} Refresh
                        </Button>
                    </>
                }
            />

            {feed.error !== null && !feed.data && <LoadError error={feed.error} what="events" onRetry={feed.refresh} busy={feed.refreshing} />}

            <div className="mb-4 flex flex-wrap items-center gap-3">
                <select value={tenant} onChange={(e) => setTenant(e.target.value)} aria-label="Filter by tenant" className={cn(inputClass, 'w-auto min-w-[170px]')}>
                    <option value="all">All tenants</option>
                    {tenants.map(([id, name]) => (
                        <option key={id} value={id}>
                            {name}
                        </option>
                    ))}
                </select>
                <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    aria-label="Filter by event type"
                    className={cn(inputClass, 'w-auto min-w-[230px] font-mono text-[13px]')}
                >
                    <option value="all">All event types</option>
                    {types.map((t) => (
                        <option key={t} value={t}>
                            {t}
                        </option>
                    ))}
                </select>
                <Segmented<StatusFilter>
                    label="Filter by status"
                    value={status}
                    onChange={setStatus}
                    options={(['all', 'Success', 'Warning', 'Error'] as StatusFilter[]).map((s) => ({
                        value: s,
                        label: s === 'all' ? 'All' : s,
                        count: statusCount(s),
                    }))}
                />
            </div>

            <Panel flush>
                <div className="hidden grid-cols-[92px_44px_minmax(0,1.3fr)_minmax(0,1fr)_96px_24px] gap-4 border-b border-ink/70 bg-paper-deep/50 px-5 py-2.5 md:grid">
                    {['Time', 'Stage', 'Event', 'Tenant', 'Status', ''].map((h, i) => (
                        <span key={i} className="label">
                            {h}
                        </span>
                    ))}
                </div>
                {feed.loading ? (
                    <div className="space-y-px">
                        {[0, 1, 2, 3, 4].map((i) => (
                            <div key={i} className="h-12 animate-pulse border-b border-rule bg-paper/40" />
                        ))}
                    </div>
                ) : rows.length === 0 ? (
                    <Empty title={events.length ? 'Nothing matches' : 'No events yet'}>
                        {events.length ? 'Loosen a filter to see more.' : 'Provision a tenant and every hop it makes lands here.'}
                    </Empty>
                ) : (
                    <ol>
                        {rows.map((e, i) => {
                            const ts = Date.parse(e.timestamp);
                            const day = dayOf(e);
                            const showDay = i === 0 || dayOf(rows[i - 1]) !== day;
                            return (
                                <Fragment key={e.id}>
                                    {showDay && (
                                        <li className="border-b border-rule bg-paper/70 px-5 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
                                            {day}
                                        </li>
                                    )}
                                    <EventRow event={e} ts={ts} fresh={feed.freshIds.has(e.id)} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} />
                                </Fragment>
                            );
                        })}
                    </ol>
                )}
                {!feed.loading && rows.length > 0 && (
                    <p className="border-t border-rule px-5 py-2.5 font-mono text-[11px] text-ink-3">
                        {rows.length} of {events.length} shown{tail ? ' · tailing every 4 s' : ''}
                    </p>
                )}
            </Panel>
        </>
    );
}

function EventRow({ event: e, ts, fresh, open, onToggle }: { event: EventLog; ts: number; fresh: boolean; open: boolean; onToggle: () => void }) {
    const stage = stageForEvent(e.eventType);
    const err = eventErrorText(e);
    return (
        <li className={cn('border-b border-rule last:border-b-0', fresh && 'anim-row-in')}>
            <div
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onClick={onToggle}
                onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        onToggle();
                    }
                }}
                className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 px-4 py-2.5 transition-colors hover:bg-paper/70 sm:px-5 md:grid-cols-[92px_44px_minmax(0,1.3fr)_minmax(0,1fr)_96px_24px]"
            >
                <span className="num order-3 font-mono text-[12px] text-ink-3 md:order-none">{format(ts, 'HH:mm:ss.SSS')}</span>
                <span className="hidden font-mark text-[9px] tracking-[0.1em] text-ink-3 md:block">{stage?.code ?? '—'}</span>
                <span className="min-w-0">
                    <span className="block truncate font-mono text-[13px] font-medium text-ink">{e.eventType}</span>
                    <span className={cn('block truncate text-[13px]', err ? 'text-abort' : 'text-ink-3')}>{err ?? eventLabel(e.eventType)}</span>
                </span>
                <span className="order-4 min-w-0 truncate text-[14px] md:order-none">
                    <Link to={`/tenants/${e.tenantId}`} onClick={(ev) => ev.stopPropagation()} className="relative font-medium text-ink-2 hover:text-ink hover:underline">
                        {e.tenant?.name ?? e.tenantId.slice(0, 10)}
                    </Link>
                </span>
                <span className="justify-self-end md:justify-self-start">
                    <Tag tone={EVENT_TONE[e.status] ?? 'scrub'}>{e.status}</Tag>
                </span>
                <ChevronRight size={14} className={cn('hidden text-ink-4 transition-transform md:block', open && 'rotate-90 text-ink')} />
            </div>
            {open && (
                <div className="px-4 pb-4 sm:px-5 md:pl-[176px]">
                    <PayloadView payload={e.payload} />
                </div>
            )}
        </li>
    );
}
