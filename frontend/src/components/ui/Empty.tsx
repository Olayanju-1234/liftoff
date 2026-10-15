import type { ReactNode } from 'react';

interface EmptyProps {
    title: string;
    children?: ReactNode;
    action?: ReactNode;
}

export default function Empty({ title, children, action }: EmptyProps) {
    return (
        <div className="flex flex-col items-center px-6 py-12 text-center">
            <svg width="132" height="40" viewBox="0 0 132 40" aria-hidden className="mb-5">
                <line x1="4" y1="20" x2="128" y2="20" className="stroke-rule-strong" strokeWidth="1.5" strokeDasharray="3 3" />
                {[0, 1, 2, 3, 4].map((i) => (
                    <rect key={i} x={8 + i * 22} y="14" width="12" height="12" rx="1" className="fill-card stroke-rule-strong" strokeWidth="1.2" />
                ))}
                <circle cx="122" cy="20" r="6" className="fill-card stroke-rule-strong" strokeWidth="1.2" strokeDasharray="2 1.5" />
            </svg>
            <p className="font-cond text-[20px] font-semibold text-ink">{title}</p>
            {children && <div className="mt-1.5 max-w-md text-[14px] text-ink-3">{children}</div>}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}
