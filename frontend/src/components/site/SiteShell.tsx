import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Menu, X } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { buttonClass } from '../../lib/ui';
import { cn } from '../../lib/cn';
import { Wordmark } from '../ui/Brand';
import { REPO, SUPPORT_EMAIL, SWAGGER_URL } from './site';

const NAV = [
    { to: '/', label: 'Product', end: true },
    { to: '/pricing', label: 'Pricing' },
    { to: '/docs', label: 'Docs' },
];

interface SiteShellProps {
    children: ReactNode;
    sheet: string;
    sheetOf?: string;
}

export default function SiteShell({ children, sheet, sheetOf = '5' }: SiteShellProps) {
    const { isAuthenticated } = useAuth();
    const [open, setOpen] = useState(false);

    return (
        <div className="drafting flex min-h-screen flex-col">
            <header className="sticky top-0 z-40 border-b border-rule bg-paper/85 backdrop-blur">
                <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-6 px-4 sm:px-6 lg:px-10">
                    <Link to="/" aria-label="Liftoff home" onClick={() => setOpen(false)}>
                        <Wordmark />
                    </Link>
                    <nav className="hidden items-center gap-6 text-[14px] font-medium text-ink-2 md:flex" aria-label="Site">
                        {NAV.map((n) => (
                            <NavLink
                                key={n.to}
                                to={n.to}
                                end={n.end}
                                className={({ isActive }) => cn('hover:text-ink', isActive && 'text-ink underline decoration-ignite decoration-2 underline-offset-[6px]')}
                            >
                                {n.label}
                            </NavLink>
                        ))}
                        <a href={REPO} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-ink">
                            GitHub <ArrowUpRight size={14} />
                        </a>
                    </nav>
                    <div className="ml-auto hidden items-center gap-2 md:flex">
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
                                    Start free
                                </Link>
                            </>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        aria-expanded={open}
                        aria-label={open ? 'Close menu' : 'Open menu'}
                        className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded text-ink-2 hover:bg-ink/[0.05] md:hidden"
                    >
                        {open ? <X size={18} /> : <Menu size={18} />}
                    </button>
                </div>
                {open && (
                    <nav className="border-t border-rule bg-card px-4 py-3 md:hidden" aria-label="Site">
                        <ul className="divide-y divide-rule">
                            {NAV.map((n) => (
                                <li key={n.to}>
                                    <NavLink to={n.to} end={n.end} onClick={() => setOpen(false)} className="block py-2.5 text-[15px] font-medium text-ink">
                                        {n.label}
                                    </NavLink>
                                </li>
                            ))}
                            <li>
                                <a href={REPO} target="_blank" rel="noreferrer" className="block py-2.5 text-[15px] font-medium text-ink">
                                    GitHub
                                </a>
                            </li>
                        </ul>
                        <div className="mt-3 flex gap-2">
                            {isAuthenticated ? (
                                <Link to="/" className={cn(buttonClass('primary', 'md'), 'flex-1')}>
                                    Open dashboard
                                </Link>
                            ) : (
                                <>
                                    <Link to="/login" className={cn(buttonClass('secondary', 'md'), 'flex-1')}>
                                        Sign in
                                    </Link>
                                    <Link to="/register" className={cn(buttonClass('primary', 'md'), 'flex-1')}>
                                        Start free
                                    </Link>
                                </>
                            )}
                        </div>
                    </nav>
                )}
            </header>

            <main className="flex-1">{children}</main>

            <footer className="border-t border-ink/80 bg-card">
                <div className="mx-auto max-w-[1240px] border-x border-rule">
                    <div className="grid grid-cols-2 text-[13px] md:grid-cols-5">
                        {[
                            ['Drawing', 'Liftoff provisioning control'],
                            ['Drawn by', 'Joseph Olayanju'],
                            ['Source', 'github.com/Olayanju-1234/liftoff'],
                            ['Revision', '2026.10'],
                            ['Sheet', `${sheet} of ${sheetOf}`],
                        ].map(([k, v]) => (
                            <div key={k} className="border-b border-r border-rule px-4 py-3 md:border-b-0 md:last:border-r-0">
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
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-rule px-4 py-3 text-[13px] text-ink-3">
                        <Link to="/terms" className="hover:text-ink">
                            Terms of service
                        </Link>
                        <Link to="/privacy" className="hover:text-ink">
                            Privacy
                        </Link>
                        <Link to="/docs" className="hover:text-ink">
                            Docs
                        </Link>
                        <a href={SWAGGER_URL} target="_blank" rel="noreferrer" className="hover:text-ink">
                            API reference
                        </a>
                        <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-ink">
                            Support
                        </a>
                        <span className="ml-auto font-mono text-[11px]">Hosted at liftoff.ojusentinel.com</span>
                    </div>
                </div>
            </footer>
        </div>
    );
}

export function SectionHead({ sheet, title, lede, id }: { sheet: string; title: string; lede: ReactNode; id?: string }) {
    return (
        <div id={id} className="mb-8 grid scroll-mt-24 gap-3 border-b-2 border-ink pb-5 md:grid-cols-12 md:items-end">
            <div className="md:col-span-5">
                <p className="label mb-2">Sheet {sheet}</p>
                <h2 className="font-cond text-[40px] font-semibold uppercase leading-[0.95] tracking-[0.005em] text-ink">{title}</h2>
            </div>
            <p className="max-w-xl text-[16px] text-ink-2 md:col-span-7">{lede}</p>
        </div>
    );
}

export function Soon({ children = 'Coming soon' }: { children?: ReactNode }) {
    return (
        <span className="inline-flex h-[20px] items-center whitespace-nowrap rounded-sm border border-hold/45 bg-hold/[0.08] px-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.07em] text-hold">
            {children}
        </span>
    );
}

export function Code({ children, tone = 'text-ink' }: { children: ReactNode; tone?: string }) {
    return <code className={`rounded-sm bg-paper-deep px-1 py-px font-mono text-[12.5px] ${tone}`}>{children}</code>;
}
