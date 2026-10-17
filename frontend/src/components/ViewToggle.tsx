import { useViewMode, viewModeStore } from '../lib/viewMode';
import type { ViewMode } from '../lib/viewMode';
import { cn } from '../lib/cn';

const OPTIONS: { value: ViewMode; label: string; title: string }[] = [
    { value: 'engineering', label: 'Engineering', title: 'Pipeline diagram, event log and routing detail' },
    { value: 'simple', label: 'Simple', title: 'Plain-language view of your tenants' },
];

export default function ViewToggle({ className }: { className?: string }) {
    const mode = useViewMode();
    return (
        <div role="radiogroup" aria-label="View" className={cn('inline-flex rounded border border-rule-strong bg-card p-0.5', className)}>
            {OPTIONS.map((o) => {
                const on = o.value === mode;
                return (
                    <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        title={o.title}
                        onClick={() => viewModeStore.set(o.value)}
                        className={cn(
                            'inline-flex h-6 items-center rounded-sm px-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] transition-colors',
                            on ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-paper-deep hover:text-ink',
                        )}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}
