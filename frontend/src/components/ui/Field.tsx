import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface FieldProps {
    label: string;
    htmlFor: string;
    hint?: ReactNode;
    error?: string;
    aside?: ReactNode;
    children: ReactNode;
    className?: string;
}

export function Field({ label, htmlFor, hint, error, aside, children, className }: FieldProps) {
    return (
        <div className={className}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <label htmlFor={htmlFor} className="label text-ink-2">
                    {label}
                </label>
                {aside && <span className="font-mono text-[11px] text-ink-3">{aside}</span>}
            </div>
            {children}
            {error ? (
                <p className="mt-1.5 text-[13px] text-abort">{error}</p>
            ) : (
                hint && <p className="mt-1.5 text-[13px] text-ink-3">{hint}</p>
            )}
        </div>
    );
}

interface ToggleProps {
    checked: boolean;
    onChange: (next: boolean) => void;
    label: string;
    disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                'relative inline-flex h-[22px] w-[40px] shrink-0 items-center rounded-sm border transition-colors disabled:opacity-50',
                checked ? 'border-ink bg-ink' : 'border-rule-strong bg-paper-deep',
            )}
        >
            <span
                className={cn(
                    'absolute top-[2px] h-4 w-4 rounded-[2px] border transition-transform duration-150',
                    checked ? 'translate-x-[20px] border-paper bg-paper' : 'translate-x-[2px] border-rule-strong bg-card',
                )}
            />
        </button>
    );
}

interface SegmentedProps<T extends string> {
    value: T;
    onChange: (v: T) => void;
    options: { value: T; label: ReactNode; count?: number }[];
    label: string;
    className?: string;
}

export function Segmented<T extends string>({ value, onChange, options, label, className }: SegmentedProps<T>) {
    return (
        <div role="radiogroup" aria-label={label} className={cn('inline-flex flex-wrap rounded border border-rule-strong bg-card p-0.5', className)}>
            {options.map((o) => {
                const on = o.value === value;
                return (
                    <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => onChange(o.value)}
                        className={cn(
                            'inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-[13px] font-medium transition-colors',
                            on ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-paper-deep hover:text-ink',
                        )}
                    >
                        {o.label}
                        {o.count !== undefined && (
                            <span className={cn('num font-mono text-[11px]', on ? 'text-paper/70' : 'text-ink-3')}>{o.count}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
