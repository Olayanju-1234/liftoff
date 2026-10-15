import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({
    extend: {
        classGroups: {
            'font-family': [{ font: ['cond', 'mark'] }],
            shadow: [{ shadow: ['sheet', 'lift'] }],
        },
    },
});

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
