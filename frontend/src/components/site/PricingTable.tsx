import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { buttonClass } from '../../lib/ui';
import { cn } from '../../lib/cn';
import { PLANS } from './site';
import { Soon } from './SiteShell';

export default function PricingTable({ compact = false }: { compact?: boolean }) {
    return (
        <div className="grid gap-5 md:grid-cols-2">
            {PLANS.map((p) => {
                const pro = p.id === 'pro';
                return (
                    <article
                        key={p.id}
                        className={cn('crop flex flex-col rounded-md border bg-card', pro ? 'border-ink shadow-lift' : 'border-rule-strong shadow-sheet')}
                    >
                        <div className="flex items-center justify-between border-b border-rule px-5 py-3">
                            <span className="label text-ink">{p.name}</span>
                            <span className="font-mono text-[10.5px] text-ink-3">{pro ? 'PLAN B · LIVE TRAFFIC' : 'PLAN A · EVALUATION'}</span>
                        </div>
                        <div className="px-5 pb-5 pt-5">
                            <p className="flex items-baseline gap-2">
                                <span className="font-cond text-[52px] font-bold leading-none text-ink">{p.price}</span>
                                <span className="text-[14px] text-ink-3">{p.unit}</span>
                            </p>
                            <p className="mt-3 text-[15px] text-ink-2">{p.tagline}</p>
                            <ul className="mt-5 divide-y divide-rule border-y border-rule">
                                {p.rows.map((r) => (
                                    <li key={r.text} className="flex items-start gap-3 py-2.5 text-[14.5px] text-ink">
                                        <Check size={15} className={cn('mt-[3px] shrink-0', r.soon ? 'text-ink-4' : 'text-go')} />
                                        <span className={cn('flex-1', r.soon && 'text-ink-2')}>
                                            {r.text}
                                            {r.note && <span className="block font-mono text-[11px] text-ink-3">{r.note}</span>}
                                        </span>
                                        {r.soon && <Soon />}
                                    </li>
                                ))}
                            </ul>
                            <Link to={p.ctaTo} className={cn(buttonClass(pro ? 'primary' : 'secondary', 'md'), 'mt-5 h-11 w-full text-[15px]')}>
                                {p.cta} <ArrowRight size={15} />
                            </Link>
                        </div>
                    </article>
                );
            })}
            {!compact && (
                <p className="text-[13.5px] text-ink-3 md:col-span-2">
                    Pro pricing is not final. The shape is settled: you pay for tenants that are active this month, and nothing for test
                    tenants or tenants you have deleted.
                </p>
            )}
        </div>
    );
}
