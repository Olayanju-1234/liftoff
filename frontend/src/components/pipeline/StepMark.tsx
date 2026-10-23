import { Check } from 'lucide-react';
import type { StageState } from '../../lib/pipeline';
import { cn } from '../../lib/cn';

// A step's square on the Simple views: a tick when done, its number while waiting.
export default function StepMark({ state, index }: { state: StageState; index: number }) {
    const base = 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border font-mono text-[11px] font-medium';
    switch (state) {
        case 'SUCCESS':
            return (
                <span className={cn(base, 'border-go bg-go text-card')} aria-label="Done">
                    <Check size={14} />
                </span>
            );
        case 'IN_PROGRESS':
            return (
                <span className={cn(base, 'anim-ring border-ignite bg-ignite text-card')} aria-label="In progress">
                    {index + 1}
                </span>
            );
        case 'STALLED':
            return (
                <span className={cn(base, 'border-hold bg-hold text-card')} aria-label="Stuck">
                    {index + 1}
                </span>
            );
        case 'FAILED':
            return (
                <span className={cn(base, 'border-abort bg-abort text-card')} aria-label="Failed">
                    !
                </span>
            );
        case 'CANCELLED':
            return <span className={cn(base, 'hatch border-scrub/60 text-transparent')} aria-label="Cancelled" />;
        case 'SKIPPED':
            return (
                <span className={cn(base, 'border-dashed border-ink/50 text-ink-3')} aria-label="Skipped">
                    –
                </span>
            );
        default:
            return <span className={cn(base, 'border-rule-strong bg-card text-ink-4')}>{index + 1}</span>;
    }
}
