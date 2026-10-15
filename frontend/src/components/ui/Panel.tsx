import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface PanelProps {
    fig?: string;
    title?: ReactNode;
    meta?: ReactNode;
    actions?: ReactNode;
    crop?: boolean;
    flush?: boolean;
    className?: string;
    bodyClassName?: string;
    children: ReactNode;
    id?: string;
}

export default function Panel({
    fig,
    title,
    meta,
    actions,
    crop = false,
    flush = false,
    className,
    bodyClassName,
    children,
    id,
}: PanelProps) {
    return (
        <section id={id} className={cn('rounded-md border border-rule bg-card shadow-sheet', crop && 'crop', className)}>
            {(title || fig || actions) && (
                <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-4 py-3 sm:px-5">
                    <div className="flex min-w-0 items-baseline gap-3">
                        {fig && <span className="label shrink-0">{fig}</span>}
                        {title && (
                            <h2 className="truncate font-cond text-[19px] font-semibold leading-tight text-ink">{title}</h2>
                        )}
                    </div>
                    {meta && <div className="font-mono text-[11px] text-ink-3">{meta}</div>}
                    {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
                </header>
            )}
            <div className={cn(!flush && 'p-4 sm:p-5', bodyClassName)}>{children}</div>
        </section>
    );
}
