import type { Condition, StageState } from './pipeline';

export type Tone = 'go' | 'ignite' | 'hold' | 'abort' | 'scrub' | 'ink' | 'blueprint';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'abort' | 'ghost';
export type ButtonSize = 'sm' | 'md';

const BUTTON_BASE =
    'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded font-medium transition-[background-color,border-color,color,box-shadow] disabled:pointer-events-none disabled:opacity-50';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
    primary: 'border border-ink bg-ink text-paper hover:bg-ink-2 hover:border-ink-2',
    secondary: 'border border-rule-strong bg-card text-ink hover:border-ink-3 hover:bg-paper',
    danger: 'border border-abort/40 bg-card text-abort hover:border-abort/70 hover:bg-abort/[0.06]',
    abort: 'border border-abort bg-abort text-card hover:border-abort/90 hover:bg-abort/90',
    ghost: 'border border-transparent text-ink-2 hover:bg-ink/[0.05] hover:text-ink',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
    sm: 'h-8 px-3 text-[13px]',
    md: 'h-10 px-4 text-[14px]',
};

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md') {
    return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]}`;
}

export const inputClass =
    'h-10 w-full rounded border border-rule-strong bg-card px-3 text-[15px] text-ink placeholder:text-ink-4 transition-colors hover:border-ink-3 focus:border-blueprint focus:outline-none focus:ring-2 focus:ring-blueprint/15 disabled:opacity-60';

export const TONE_TEXT: Record<Tone, string> = {
    go: 'text-go',
    ignite: 'text-ignite',
    hold: 'text-hold',
    abort: 'text-abort',
    scrub: 'text-scrub',
    ink: 'text-ink',
    blueprint: 'text-blueprint',
};

export const TONE_TAG: Record<Tone, string> = {
    go: 'text-go border-go/35 bg-go/[0.07]',
    ignite: 'text-ignite border-ignite/40 bg-ignite/[0.07]',
    hold: 'text-hold border-hold/45 bg-hold/[0.08]',
    abort: 'text-abort border-abort/35 bg-abort/[0.07]',
    scrub: 'text-scrub border-scrub/35 bg-scrub/[0.06]',
    ink: 'text-ink border-ink/30 bg-ink/[0.04]',
    blueprint: 'text-blueprint border-blueprint/35 bg-blueprint/[0.06]',
};

export const TONE_SWATCH: Record<Tone, string> = {
    go: 'bg-go',
    ignite: 'bg-ignite',
    hold: 'bg-hold',
    abort: 'bg-abort',
    scrub: 'hatch border border-scrub/60',
    ink: 'bg-ink',
    blueprint: 'bg-blueprint',
};

export const CONDITION_META: Record<Condition, { label: string; tone: Tone; live?: boolean }> = {
    active: { label: 'Active', tone: 'go' },
    running: { label: 'Provisioning', tone: 'ignite', live: true },
    stalled: { label: 'Stalled', tone: 'hold' },
    waiting: { label: 'Not started', tone: 'scrub' },
    failed: { label: 'Failed', tone: 'abort' },
    cancelled: { label: 'Cancelled', tone: 'scrub' },
    suspended: { label: 'Suspended', tone: 'scrub' },
    removing: { label: 'Removing', tone: 'scrub', live: true },
    removed: { label: 'Removed', tone: 'scrub' },
};

export const STAGE_STATE_META: Record<StageState, { label: string; tone: Tone }> = {
    PENDING: { label: 'Pending', tone: 'scrub' },
    IN_PROGRESS: { label: 'In flight', tone: 'ignite' },
    STALLED: { label: 'Stalled', tone: 'hold' },
    SUCCESS: { label: 'Done', tone: 'ink' },
    FAILED: { label: 'Failed', tone: 'abort' },
    CANCELLED: { label: 'Cancelled', tone: 'scrub' },
    SKIPPED: { label: 'Skipped', tone: 'scrub' },
};

export const EVENT_TONE: Record<string, Tone> = {
    Success: 'go',
    Warning: 'hold',
    Error: 'abort',
};
