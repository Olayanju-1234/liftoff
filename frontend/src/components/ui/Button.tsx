import type { ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { buttonClass } from '../../lib/ui';
import type { ButtonSize, ButtonVariant } from '../../lib/ui';
import { cn } from '../../lib/cn';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    busy?: boolean;
}

export default function Button({
    variant = 'secondary',
    size = 'md',
    busy = false,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
}: ButtonProps) {
    return (
        <button type={type} className={cn(buttonClass(variant, size), className)} disabled={disabled || busy} {...rest}>
            {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {children}
        </button>
    );
}
