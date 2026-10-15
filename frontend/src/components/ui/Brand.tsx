import { cn } from '../../lib/cn';

export function Mark({ size = 26, className }: { size?: number; className?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
            <rect width="32" height="32" rx="4" className="fill-ink" />
            <rect x="5" y="21" width="3" height="5" className="fill-paper" />
            <rect x="10" y="18" width="3" height="8" className="fill-paper" />
            <rect x="15" y="15" width="3" height="11" className="fill-paper" />
            <rect x="20" y="12" width="3" height="14" className="fill-paper" />
            <circle cx="25.5" cy="7.5" r="3" className="fill-ignite" />
        </svg>
    );
}

export function Wordmark({ className, sub }: { className?: string; sub?: string }) {
    return (
        <span className={cn('inline-flex items-center gap-2.5', className)}>
            <Mark />
            <span className="flex flex-col leading-none">
                <span className="font-mark text-[13px] tracking-[0.22em] text-ink">LIFTOFF</span>
                {sub && <span className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-3">{sub}</span>}
            </span>
        </span>
    );
}
