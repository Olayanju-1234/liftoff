import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import SiteShell, { Code } from '../components/site/SiteShell';
import PricingTable from '../components/site/PricingTable';
import { REPO } from '../components/site/site';
import { buttonClass } from '../lib/ui';

const FAQ: [string, React.ReactNode][] = [
    [
        'What counts as an active tenant?',
        'A tenant whose status is ACTIVE at any point in the month. Tenants that are still provisioning, failed, cancelled or deleted are never billed.',
    ],
    [
        'What happens when I reach 10 active tenants on Free?',
        <>
            Nothing stops you today; the limit is enforced from the next release. After that, <Code>POST /tenants</Code> answers 429 with a plain message until you delete
            a tenant or upgrade. Existing tenants keep running either way.
        </>,
    ],
    [
        'Do test tenants count?',
        'Test mode is coming soon. A test tenant will provision exactly like a real one, never bill, never count towards the limit, and can be deleted instantly.',
    ],
    [
        'Whose Stripe account is used for the customer trial?',
        'On the hosted service today the billing step records a 14-day trial without charging anyone. Connecting your own Stripe account, so your customers subscribe to you and not to us, is on the Pro roadmap.',
    ],
    [
        'How will I pay for Pro?',
        'Pro billing is not switched on yet, so every account is on Free. When it is, you pay by card at the end of each month for the tenants that were active, and you will see the price before you are asked for a card.',
    ],
    [
        'Can I run it myself?',
        <>
            The source is on{' '}
            <a href={REPO} target="_blank" rel="noreferrer" className="link">
                GitHub
            </a>
            . These prices are for the hosted service at liftoff.ojusentinel.com, which we run, patch and watch for you.
        </>,
    ],
];

export default function Pricing() {
    return (
        <SiteShell sheet="2">
            <div className="mx-auto max-w-[1240px] px-4 pb-20 pt-12 sm:px-6 lg:px-10">
                <header className="mb-10 border-b-2 border-ink pb-6">
                    <p className="label mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-ink">Sheet P1</span>
                        <span aria-hidden className="h-px w-6 bg-rule-strong" />
                        <span>Pricing</span>
                    </p>
                    <h1 className="font-cond text-[44px] font-semibold uppercase leading-[0.92] text-ink sm:text-[56px]">Pay for customers, not seats</h1>
                    <p className="mt-4 max-w-2xl text-[16px] text-ink-2">
                        Free while you wire it up and evaluate. When you go live, the bill follows the number of customers you actually have active that month.
                        Nothing is charged until you choose Pro.
                    </p>
                </header>

                <PricingTable />

                <section className="mt-14">
                    <div className="mb-6 flex items-baseline gap-3 border-b border-ink/70 pb-3">
                        <span className="font-mark text-[12px] tracking-[0.12em] text-ink">P2</span>
                        <h2 className="font-cond text-[30px] font-semibold uppercase leading-none text-ink">Questions</h2>
                    </div>
                    <ol className="divide-y divide-rule overflow-hidden rounded-md border border-rule bg-card">
                        {FAQ.map(([q, a], i) => (
                            <li key={q} className="grid gap-x-5 gap-y-1 px-4 py-4 sm:grid-cols-[36px_minmax(0,1fr)] sm:px-5">
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-ink font-mono text-[12px] font-medium">{i + 1}</span>
                                <div>
                                    <h3 className="text-[16px] font-semibold text-ink">{q}</h3>
                                    <p className="mt-1 max-w-3xl text-[14.5px] leading-relaxed text-ink-2">{a}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </section>

                <div className="mt-12 flex flex-col items-start gap-4 rounded-md border border-dashed border-rule-strong bg-card/70 px-5 py-5 sm:flex-row sm:items-center">
                    <div className="flex-1">
                        <p className="font-cond text-[22px] font-semibold text-ink">Start on Free. Nothing to cancel later.</p>
                        <p className="text-[14.5px] text-ink-2">No card, no trial clock. Upgrade when your customers are real.</p>
                    </div>
                    <Link to="/register" className={buttonClass('primary', 'md')}>
                        Start free <ArrowRight size={15} />
                    </Link>
                </div>
            </div>
        </SiteShell>
    );
}
