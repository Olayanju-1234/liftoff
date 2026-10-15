import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Wordmark } from './ui/Brand';
import { STAGES } from '../lib/pipeline';
import { useNow } from '../lib/hooks';
import { cn } from '../lib/cn';

interface AuthShellProps {
    sheet: string;
    title: string;
    lede: ReactNode;
    children: ReactNode;
    aside: ReactNode;
}

export default function AuthShell({ sheet, title, lede, children, aside }: AuthShellProps) {
    return (
        <div className="drafting grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex flex-col px-5 py-6 sm:px-10">
                <div className="flex items-center justify-between">
                    <Link to="/" aria-label="Liftoff home">
                        <Wordmark />
                    </Link>
                    <Link to="/" className="inline-flex items-center gap-1.5 text-[13.5px] text-ink-3 hover:text-ink">
                        <ArrowLeft size={14} /> Overview
                    </Link>
                </div>
                <div className="flex flex-1 items-center justify-center py-10">
                    <div className="w-full max-w-[420px]">
                        <p className="label mb-3">Sheet {sheet}</p>
                        <h1 className="font-cond text-[44px] font-semibold uppercase leading-[0.92] text-ink">{title}</h1>
                        <p className="mt-3 text-[15px] text-ink-2">{lede}</p>
                        <div className="crop mt-8 rounded-md border border-rule-strong bg-card p-5 shadow-sheet sm:p-6">{children}</div>
                    </div>
                </div>
            </div>
            <aside className="hidden border-l border-ink/70 bg-card lg:flex lg:flex-col">{aside}</aside>
        </div>
    );
}

export function StageLadder({ caption }: { caption?: string }) {
    const now = useNow();
    const lit = Math.floor(now / 1000) % (STAGES.length + 1);
    return (
        <ol className="relative">
            <span aria-hidden className="absolute bottom-6 left-[15px] top-6 w-px bg-rule-strong" />
            {STAGES.map((s, i) => {
                const done = i < lit;
                const live = i === lit;
                return (
                    <li key={s.key} className="relative flex items-start gap-4 py-2.5">
                        <span
                            className={cn(
                                'relative z-10 mt-0.5 inline-flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-sm border font-mark text-[8.5px] tracking-[0.08em] transition-colors duration-300',
                                done && 'border-ink bg-ink text-paper',
                                live && 'anim-ring border-ignite bg-ignite text-card',
                                !done && !live && 'border-rule-strong bg-card text-ink-3',
                            )}
                        >
                            {s.code}
                        </span>
                        <span className="min-w-0">
                            <span className="block font-mono text-[13px] font-medium text-ink">{s.service}</span>
                            <span className="block font-mono text-[11.5px] text-ink-3">
                                {s.consumes} <span className="text-ink-4">→</span>{' '}
                                <span className={live ? 'text-ignite' : done ? 'text-blueprint' : ''}>{s.emits}</span>
                            </span>
                        </span>
                    </li>
                );
            })}
            <li className="relative flex items-center gap-4 py-2.5">
                <span
                    className={cn(
                        'relative z-10 inline-flex h-[31px] w-[31px] items-center justify-center rounded-full border transition-colors duration-300',
                        lit === STAGES.length ? 'border-go bg-go text-card' : 'border-dashed border-rule-strong bg-card text-ink-4',
                    )}
                >
                    <span className="font-mono text-[10px] font-medium">GO</span>
                </span>
                <span className="font-mono text-[12px] text-ink-3">{caption ?? 'tenant ACTIVE'}</span>
            </li>
        </ol>
    );
}
