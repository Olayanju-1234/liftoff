import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { Check } from 'lucide-react';
import { getPublicStatus } from '../lib/api';
import { useResource } from '../lib/hooks';
import { cn } from '../lib/cn';
import type { PublicStepState, PublicTenantStatus } from '../lib/types';
import { Mark } from '../components/ui/Brand';

const STEP_LABEL: Record<PublicStepState, string> = {
    waiting: 'Waiting',
    'in-progress': 'In progress',
    done: 'Done',
    skipped: 'Skipped',
    failed: 'Failed',
    stopped: 'Stopped',
};

// The company's customer lands here from a link, with no account. Everything it says is
// in plain words; nothing names a system, and nothing here can change anything.
export default function Status() {
    const { token = '' } = useParams();
    const [live, setLive] = useState(true);
    const status = useResource(
        async () => {
            const next = await getPublicStatus(token);
            setLive(next.state === 'setting-up');
            return next;
        },
        { interval: live ? 5000 : 60_000, key: token },
    );

    const missing = isAxiosError(status.error) && status.error.response?.status === 404;

    return (
        <div className="drafting flex min-h-screen flex-col items-center px-4 py-10 sm:py-16">
            <main className="w-full max-w-[520px]">
                {status.loading ? (
                    <div className="h-72 animate-pulse rounded-md border border-rule bg-card/60" />
                ) : status.data ? (
                    <Progress status={status.data} />
                ) : (
                    <Card eyebrow={missing ? 'Nothing here' : 'Connection problem'} title={missing ? "This link isn't valid" : "We couldn't load this page"}>
                        <p className="text-[15px] text-ink-2">
                            {missing
                                ? 'It may have been copied incompletely, or the setup it pointed to is gone. Ask the company that sent it for a new one.'
                                : 'Check your connection and try again in a moment.'}
                        </p>
                    </Card>
                )}
            </main>
            <footer className="mt-8 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-4">
                <Mark size={14} />
                <span>
                    Powered by{' '}
                    <Link to="/about" className="text-ink-3 hover:text-ink">
                        Liftoff
                    </Link>
                </span>
            </footer>
        </div>
    );
}

function Card({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
    return (
        <section className="crop rounded-md border border-rule-strong bg-card shadow-sheet">
            <div className="px-6 pb-5 pt-7 sm:px-8">
                <p className="label mb-2">{eyebrow}</p>
                <h1 className="font-cond text-[34px] font-semibold leading-[0.98] text-ink sm:text-[40px]">{title}</h1>
            </div>
            <div className="border-t border-rule px-6 py-5 sm:px-8">{children}</div>
        </section>
    );
}

const HEADLINE: Record<PublicTenantStatus['state'], { eyebrow: (company: string) => string; title: string }> = {
    'setting-up': { eyebrow: (c) => `${c || 'Your provider'} is setting you up`, title: 'Setting up your workspace…' },
    ready: { eyebrow: (c) => `${c || 'Your provider'} has you set up`, title: 'Your workspace is ready' },
    'needs-attention': { eyebrow: (c) => `${c || 'Your provider'} has been told`, title: 'Something needs attention' },
    stopped: { eyebrow: (c) => c || 'Your provider', title: 'This setup was stopped' },
    removed: { eyebrow: (c) => c || 'Your provider', title: 'This workspace is no longer available' },
};

export function Progress({ status }: { status: PublicTenantStatus }) {
    const head = HEADLINE[status.state];
    const body: Record<PublicTenantStatus['state'], string> = {
        'setting-up': `${status.done} of ${status.total} done. This usually takes less than a minute; this page updates on its own.`,
        ready: status.address ? `Your workspace is at ${status.address}.` : 'Everything is in place.',
        'needs-attention': `A step did not finish. ${status.company || 'The team'} has been notified and is looking into it; you don't need to do anything.`,
        stopped: `Setup for ${status.name} was stopped before it finished. Ask ${status.company || 'your provider'} if you were expecting a workspace.`,
        removed: `The workspace for ${status.name} was removed. Ask ${status.company || 'your provider'} if that is unexpected.`,
    };
    const tone = status.state === 'ready' ? 'go' : status.state === 'needs-attention' ? 'abort' : status.state === 'setting-up' ? 'ignite' : 'scrub';

    return (
        <Card eyebrow={head.eyebrow(status.company)} title={head.title}>
            <p className="text-[15px] text-ink-2">{body[status.state]}</p>
            {status.state === 'ready' && status.address && (
                <a
                    href={`https://${status.address}`}
                    className="mt-3 inline-block break-all font-mono text-[14px] font-medium text-blueprint hover:underline"
                    rel="noreferrer"
                >
                    https://{status.address}
                </a>
            )}
            <div className="mt-5 flex gap-1" aria-hidden>
                {status.steps.map((step) => (
                    <span
                        key={step.name}
                        className={cn(
                            'h-1 flex-1 rounded-[1px]',
                            step.state === 'done' || step.state === 'skipped'
                                ? tone === 'abort'
                                    ? 'bg-ink-3'
                                    : 'bg-go'
                                : step.state === 'failed'
                                  ? 'bg-abort'
                                  : step.state === 'in-progress'
                                    ? 'bg-ignite'
                                    : 'bg-rule-strong',
                        )}
                    />
                ))}
            </div>
            <ol className="mt-4 divide-y divide-rule">
                {status.steps.map((step, i) => (
                    <li key={step.name} className="flex items-center gap-4 py-3">
                        <StepMark state={step.state} index={i} />
                        <span className={cn('min-w-0 flex-1 text-[15px] font-medium', step.state === 'waiting' ? 'text-ink-3' : 'text-ink')}>{step.name}</span>
                        <span
                            className={cn(
                                'font-mono text-[10.5px] uppercase tracking-[0.07em]',
                                step.state === 'done' && 'text-go',
                                step.state === 'in-progress' && 'text-ignite',
                                step.state === 'failed' && 'text-abort',
                                (step.state === 'waiting' || step.state === 'skipped' || step.state === 'stopped') && 'text-ink-4',
                            )}
                        >
                            {STEP_LABEL[step.state]}
                        </span>
                    </li>
                ))}
            </ol>
        </Card>
    );
}

function StepMark({ state, index }: { state: PublicStepState; index: number }) {
    const base = 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border font-mono text-[11px] font-medium';
    switch (state) {
        case 'done':
            return (
                <span className={cn(base, 'border-go bg-go text-card')} aria-label="Done">
                    <Check size={14} />
                </span>
            );
        case 'in-progress':
            return (
                <span className={cn(base, 'anim-ring border-ignite bg-ignite text-card')} aria-label="In progress">
                    {index + 1}
                </span>
            );
        case 'failed':
            return (
                <span className={cn(base, 'border-abort bg-abort text-card')} aria-label="Failed">
                    !
                </span>
            );
        case 'stopped':
            return <span className={cn(base, 'hatch border-scrub/60 text-transparent')} aria-label="Stopped" />;
        case 'skipped':
            return (
                <span className={cn(base, 'border-dashed border-ink/50 text-ink-3')} aria-label="Skipped">
                    –
                </span>
            );
        default:
            return <span className={cn(base, 'border-rule-strong bg-card text-ink-4')}>{index + 1}</span>;
    }
}
