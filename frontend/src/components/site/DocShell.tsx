import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface TocItem {
    id: string;
    label: string;
}

interface DocShellProps {
    sheet: string;
    eyebrow: string;
    title: string;
    lede: ReactNode;
    meta?: ReactNode;
    toc: TocItem[];
    children: ReactNode;
}

// Two-column reading layout: a sticky contents list and numbered sections.
export default function DocShell({ sheet, eyebrow, title, lede, meta, toc, children }: DocShellProps) {
    return (
        <div className="mx-auto max-w-[1240px] px-4 pb-20 pt-12 sm:px-6 lg:px-10">
            <header className="mb-10 border-b-2 border-ink pb-6">
                <p className="label mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-ink">Sheet {sheet}</span>
                    <span aria-hidden className="h-px w-6 bg-rule-strong" />
                    <span>{eyebrow}</span>
                </p>
                <h1 className="font-cond text-[44px] font-semibold uppercase leading-[0.92] tracking-[-0.005em] text-ink sm:text-[56px]">{title}</h1>
                <p className="mt-4 max-w-2xl text-[16px] text-ink-2">{lede}</p>
                {meta && <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11.5px] text-ink-3">{meta}</div>}
            </header>
            <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
                <nav aria-label="Contents" className="lg:sticky lg:top-24 lg:self-start">
                    <p className="label mb-2">Contents</p>
                    <ol className="space-y-1 border-l border-rule">
                        {toc.map((t, i) => (
                            <li key={t.id}>
                                <a href={`#${t.id}`} className="-ml-px flex items-baseline gap-2 border-l border-transparent py-1 pl-3 text-[13.5px] text-ink-2 hover:border-ink hover:text-ink">
                                    <span className="num font-mono text-[10.5px] text-ink-4">{String(i + 1).padStart(2, '0')}</span>
                                    {t.label}
                                </a>
                            </li>
                        ))}
                    </ol>
                </nav>
                <div className="min-w-0 space-y-14">{children}</div>
            </div>
        </div>
    );
}

export function DocSection({ id, n, title, children, className }: { id: string; n: string; title: string; children: ReactNode; className?: string }) {
    return (
        <section id={id} className={cn('scroll-mt-24', className)}>
            <div className="mb-5 flex items-baseline gap-3 border-b border-ink/70 pb-3">
                <span className="font-mark text-[12px] tracking-[0.12em] text-ink">{n}</span>
                <h2 className="font-cond text-[30px] font-semibold uppercase leading-none tracking-[0.005em] text-ink">{title}</h2>
            </div>
            <div className="prose-sheet space-y-4 text-[15px] leading-relaxed text-ink-2">{children}</div>
        </section>
    );
}

export function DefList({ rows }: { rows: [ReactNode, ReactNode][] }) {
    return (
        <dl className="overflow-hidden rounded-md border border-rule bg-card">
            {rows.map(([k, v], i) => (
                <div key={i} className="grid gap-x-4 gap-y-1 border-b border-rule px-4 py-3 last:border-b-0 sm:grid-cols-[180px_minmax(0,1fr)]">
                    <dt className="font-mono text-[12.5px] font-medium text-ink [overflow-wrap:anywhere]">{k}</dt>
                    <dd className="text-[14.5px] text-ink-2">{v}</dd>
                </div>
            ))}
        </dl>
    );
}
