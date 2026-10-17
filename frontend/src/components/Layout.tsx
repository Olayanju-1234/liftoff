import { Suspense, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/auth-context';
import { checkHealth, getTenants } from '../lib/api';
import { useNow, useResource } from '../lib/hooks';
import { condition } from '../lib/pipeline';
import { HOOD_HOME, isHoodPath } from '../lib/mode';
import { cn } from '../lib/cn';
import { Wordmark } from './ui/Brand';
import { Swatch } from './ui/Tag';
import ModeLink from './ModeLink';

interface NavItem {
    to: string;
    label: string;
    n: string;
    end?: boolean;
    badge?: 'tenants' | 'inflight' | 'attention';
}

type NavGroup = { group: string; items: NavItem[] };

// The product for the company's staff. Only the pages a non-engineer needs.
const SIMPLE_NAV: NavGroup[] = [
    {
        group: 'Onboarding',
        items: [{ to: '/', label: 'Customers', n: '01', end: true, badge: 'attention' }],
    },
    {
        group: 'Account',
        items: [
            { to: '/settings', label: 'Settings', n: '02' },
            { to: '/support', label: 'Help', n: '03' },
        ],
    },
];

// The engineering view, kept intact under the hood.
const HOOD_NAV: NavGroup[] = [
    {
        group: 'Operate',
        items: [
            { to: HOOD_HOME, label: 'Overview', n: '01', end: true },
            { to: '/tenants', label: 'Tenants', n: '02', badge: 'tenants' },
            { to: '/pipeline', label: 'Pipeline board', n: '03', badge: 'inflight' },
        ],
    },
    {
        group: 'Observe',
        items: [
            { to: '/events', label: 'Event log', n: '04' },
            { to: '/failed-jobs', label: 'Dead letters', n: '05', badge: 'attention' },
            { to: '/health', label: 'Services', n: '06' },
        ],
    },
    {
        group: 'Account',
        items: [
            { to: '/settings', label: 'Settings', n: '07' },
            { to: '/support', label: 'Help', n: '08' },
        ],
    },
];

const CRUMBS: Record<string, string> = {
    '': 'Customers',
    customers: 'Customers',
    'under-the-hood': 'Under the hood',
    tenants: 'Tenants',
    pipeline: 'Pipeline board',
    events: 'Event log',
    'failed-jobs': 'Dead letters',
    health: 'Services',
    settings: 'Settings',
    support: 'Help',
};

const API_HOST = (() => {
    try {
        return new URL(import.meta.env.VITE_API_URL as string).host;
    } catch {
        return 'gateway';
    }
})();

export default function Layout() {
    const [menuOpen, setMenuOpen] = useState(false);
    const location = useLocation();
    const { user } = useAuth();
    const hood = isHoodPath(location.pathname);
    const now = useNow();
    const health = useResource(checkHealth, { interval: 30_000 });
    const tenants = useResource(getTenants, { interval: 30_000 });

    // The Simple view lists customers only, so the company's own workspace tenant stays out of its counts.
    const list = (tenants.data ?? []).filter((t) => hood || t.id !== user?.tenantId);
    const counts = {
        tenants: list.length,
        inflight: list.filter((t) => ['running', 'stalled', 'waiting'].includes(condition(t, now))).length,
        attention: list.filter((t) => ['stalled', 'failed'].includes(condition(t, now))).length,
    };

    const [first, second] = location.pathname.split('/').filter(Boolean);
    const crumbs = [CRUMBS[first ?? ''] ?? 'Not found', second ? (first === 'customers' ? 'Customer' : `${second.slice(0, 10)}…`) : null].filter(
        Boolean,
    );

    const gw = health.data;
    const utc = new Date(now).toISOString().slice(11, 19);

    const rail = <RailContent counts={counts} hood={hood} onNavigate={() => setMenuOpen(false)} />;

    return (
        <div className="min-h-screen">
            <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] flex-col border-r border-rule bg-paper-deep lg:flex">
                {rail}
            </aside>

            {menuOpen && (
                <div className="fixed inset-0 z-40 lg:hidden">
                    <button
                        type="button"
                        aria-label="Close menu"
                        className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
                        onClick={() => setMenuOpen(false)}
                    />
                    <aside className="relative flex h-full w-[264px] flex-col border-r border-rule bg-paper-deep shadow-lift">
                        <button
                            type="button"
                            onClick={() => setMenuOpen(false)}
                            aria-label="Close menu"
                            className="absolute right-3 top-4 inline-flex h-8 w-8 items-center justify-center rounded text-ink-2 hover:bg-card"
                        >
                            <X size={16} />
                        </button>
                        {rail}
                    </aside>
                </div>
            )}

            <div className="lg:pl-[236px]">
                <div className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-rule bg-paper/90 px-4 backdrop-blur sm:px-6 lg:px-10">
                    <button
                        type="button"
                        onClick={() => setMenuOpen(true)}
                        className="-ml-1 inline-flex h-8 w-8 items-center justify-center rounded text-ink-2 hover:bg-card lg:hidden"
                        aria-label="Open menu"
                    >
                        <Menu size={18} />
                    </button>
                    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
                        <span className="hidden sm:inline">Liftoff</span>
                        {crumbs.map((c) => (
                            <span key={c} className="flex min-w-0 items-center gap-2">
                                <span aria-hidden className="hidden text-ink-4 sm:inline">/</span>
                                <span className="truncate text-ink-2 last:text-ink">{c}</span>
                            </span>
                        ))}
                    </nav>
                    <div className="ml-auto flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.08em] sm:gap-4">
                        {hood && (
                            <span className="num hidden text-ink-3 sm:inline" title="Coordinated Universal Time">
                                {utc} UTC
                            </span>
                        )}
                        <ModeLink />
                        {hood ? (
                            <Link
                                to="/health"
                                className="flex items-center gap-2 rounded-sm border border-rule-strong bg-card px-2 py-1 text-ink-2 transition-colors hover:border-ink-3"
                                title={`Gateway at ${API_HOST}`}
                            >
                                <span className="hidden text-ink-3 md:inline">Gateway</span>
                                {gw ? (
                                    <>
                                        <Swatch tone={gw.status === 'Operational' ? 'go' : 'abort'} />
                                        <span className={gw.status === 'Operational' ? 'text-go' : 'text-abort'}>
                                            {gw.status === 'Operational' ? 'Go' : 'No-go'}
                                        </span>
                                        <span className="num text-ink-3">{gw.latency} ms</span>
                                    </>
                                ) : (
                                    <span className="text-ink-3">Polling…</span>
                                )}
                            </Link>
                        ) : (
                            <span
                                className="hidden items-center gap-2 rounded-sm border border-rule-strong bg-card px-2 py-1 text-ink-2 sm:flex"
                                title="Connection to the Liftoff server"
                            >
                                {gw ? (
                                    <>
                                        <Swatch tone={gw.status === 'Operational' ? 'go' : 'abort'} />
                                        <span className={gw.status === 'Operational' ? 'text-go' : 'text-abort'}>
                                            {gw.status === 'Operational' ? 'Connected' : 'Connection problem'}
                                        </span>
                                    </>
                                ) : (
                                    <span className="text-ink-3">Connecting…</span>
                                )}
                            </span>
                        )}
                    </div>
                </div>

                <main className="drafting min-h-[calc(100vh-48px)]">
                    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-7 sm:px-6 lg:px-10 lg:pt-9">
                        <Suspense fallback={<div className="h-64 animate-pulse rounded-md border border-rule bg-card/50" />}>
                            <Outlet />
                        </Suspense>
                    </div>
                </main>
            </div>
        </div>
    );
}

function RailContent({
    counts,
    hood,
    onNavigate,
}: {
    counts: Record<'tenants' | 'inflight' | 'attention', number>;
    hood: boolean;
    onNavigate: () => void;
}) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await logout();
        toast.success('Signed out');
        navigate('/');
    };

    const initials = (user?.name || user?.email || '?')
        .split(/[\s@.]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase())
        .join('');

    return (
        <>
            <div className="px-5 pb-6 pt-5">
                <Link to={hood ? HOOD_HOME : '/'} onClick={onNavigate} className="inline-block">
                    <Wordmark sub={hood ? 'Under the hood' : 'Customer onboarding'} />
                </Link>
            </div>
            <nav className="scrollbar-thin flex-1 overflow-y-auto px-3" aria-label="Main">
                {(hood ? HOOD_NAV : SIMPLE_NAV).map((group) => (
                    <div key={group.group} className="mb-5">
                        <p className="label mb-1.5 px-2 text-ink-4">{group.group}</p>
                        <ul className="space-y-0.5">
                            {group.items.map((item) => {
                                const badge = item.badge ? counts[item.badge] : 0;
                                return (
                                    <li key={item.to}>
                                        <NavLink
                                            to={item.to}
                                            end={item.end}
                                            onClick={onNavigate}
                                            className={({ isActive }) =>
                                                cn(
                                                    'relative flex h-9 items-center gap-3 rounded px-2 text-[14.5px] font-medium transition-colors',
                                                    isActive
                                                        ? 'bg-card text-ink shadow-sheet before:absolute before:bottom-2 before:left-0 before:top-2 before:w-[3px] before:rounded-r-sm before:bg-ignite'
                                                        : 'text-ink-2 hover:bg-card/60 hover:text-ink',
                                                )
                                            }
                                        >
                                            <span className="num w-5 font-mono text-[10.5px] text-ink-4">{item.n}</span>
                                            <span className="flex-1 truncate">{item.label}</span>
                                            {badge > 0 && (
                                                <span
                                                    className={cn(
                                                        'num min-w-[20px] rounded-sm px-1 text-center font-mono text-[10.5px] font-medium',
                                                        item.badge === 'attention'
                                                            ? 'bg-abort text-card'
                                                            : item.badge === 'inflight'
                                                              ? 'bg-ignite/15 text-ignite'
                                                              : 'text-ink-3',
                                                    )}
                                                >
                                                    {badge}
                                                </span>
                                            )}
                                        </NavLink>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
                <Link
                    to={hood ? '/' : HOOD_HOME}
                    onClick={onNavigate}
                    className="mb-1.5 flex items-center gap-3 rounded px-2 py-1.5 text-[13px] text-ink-3 transition-colors hover:text-ink"
                >
                    <span className="w-5 font-mono text-[10.5px] text-ink-4">{hood ? '←' : '↗'}</span>
                    {hood ? 'Back to customers' : 'Under the hood'}
                </Link>
                <Link
                    to="/about"
                    onClick={onNavigate}
                    className="mb-4 flex items-center gap-3 rounded px-2 py-1.5 text-[13px] text-ink-3 transition-colors hover:text-ink"
                >
                    <span className="w-5 font-mono text-[10.5px] text-ink-4">↗</span>
                    How Liftoff works
                </Link>
            </nav>
            <div className="border-t border-rule p-3">
                <div className="flex items-center gap-3 rounded px-2 py-1.5">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-ink font-mono text-[11px] font-medium text-paper">
                        {initials}
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium leading-tight text-ink">{user?.name || user?.email}</p>
                        <p className="truncate font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-3">{user?.role}</p>
                    </div>
                    <button
                        type="button"
                        onClick={handleLogout}
                        title="Sign out"
                        aria-label="Sign out"
                        className="inline-flex h-8 w-8 items-center justify-center rounded text-ink-3 transition-colors hover:bg-card hover:text-ink"
                    >
                        <LogOut size={15} />
                    </button>
                </div>
                {hood && (
                    <p className="mt-2 truncate px-2 font-mono text-[10px] text-ink-4" title="API gateway">
                        api · {API_HOST}
                    </p>
                )}
            </div>
        </>
    );
}
