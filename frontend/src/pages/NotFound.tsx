import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { buttonClass } from '../lib/ui';
import { cn } from '../lib/cn';

export default function NotFound() {
    const { pathname } = useLocation();
    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
            <svg width="260" height="72" viewBox="0 0 260 72" aria-hidden className="mb-8">
                <line x1="8" y1="36" x2="118" y2="36" className="stroke-ink" strokeWidth="3" />
                <circle cx="70" cy="36" r="4" className="fill-ink" />
                <line x1="142" y1="36" x2="252" y2="36" className="stroke-rule-strong" strokeWidth="3" strokeDasharray="6 5" />
                <path d="M124 26 L136 46 M136 26 L124 46" className="stroke-abort" strokeWidth="2.5" />
                <text x="130" y="66" textAnchor="middle" className="fill-ink-3 font-mono text-[10px]">
                    no route
                </text>
            </svg>
            <p className="label mb-2">Error 404</p>
            <h1 className="font-cond text-[44px] font-semibold uppercase leading-none text-ink">No stage at this address</h1>
            <p className="mt-3 max-w-md text-[15px] text-ink-2">
                Nothing is bound to <code className="font-mono text-[13.5px] text-ink">{pathname}</code>. It may have been a tenant that was
                deleted.
            </p>
            <Link to="/" className={cn(buttonClass('primary', 'md'), 'mt-7')}>
                <ArrowLeft size={15} /> Back to overview
            </Link>
        </div>
    );
}
