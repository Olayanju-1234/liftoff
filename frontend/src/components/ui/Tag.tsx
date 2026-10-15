import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { CONDITION_META, TONE_SWATCH, TONE_TAG } from '../../lib/ui';
import type { Tone } from '../../lib/ui';
import type { Condition } from '../../lib/pipeline';

interface TagProps {
    tone: Tone;
    children: ReactNode;
    live?: boolean;
    className?: string;
    title?: string;
}

export function Tag({ tone, children, live = false, className, title }: TagProps) {
    return (
        <span
            title={title}
            className={cn(
                'inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-sm border px-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.07em]',
                TONE_TAG[tone],
                className,
            )}
        >
            <Swatch tone={tone} live={live} />
            {children}
        </span>
    );
}

export function Swatch({ tone, live = false, className }: { tone: Tone; live?: boolean; className?: string }) {
    return (
        <span
            aria-hidden
            className={cn('inline-block h-[7px] w-[7px] shrink-0 rounded-[1px]', TONE_SWATCH[tone], live && 'anim-ring', className)}
        />
    );
}

export function ConditionTag({ condition, className }: { condition: Condition; className?: string }) {
    const meta = CONDITION_META[condition];
    return (
        <Tag tone={meta.tone} live={meta.live} className={className}>
            {meta.label}
        </Tag>
    );
}
