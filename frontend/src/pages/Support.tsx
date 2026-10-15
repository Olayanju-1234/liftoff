import { ArrowUpRight, Mail } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { DLX, STALL_AFTER_MS } from '../lib/pipeline';
import { buttonClass } from '../lib/ui';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';

const REPO = 'https://github.com/Olayanju-1234/liftoff';
const SUPPORT_EMAIL = 'josepholayanju2003@gmail.com';

const LINKS = [
    {
        n: 'A',
        title: 'Read the README',
        body: 'Architecture, the event contract, local setup and the engineering decisions behind the saga.',
        href: `${REPO}#readme`,
        cta: 'Open docs',
    },
    {
        n: 'B',
        title: 'Open an issue',
        body: 'Bugs, rough edges or feature ideas. Include the tenant ID from its page if one is involved.',
        href: `${REPO}/issues`,
        cta: 'GitHub issues',
    },
    {
        n: 'C',
        title: 'API reference',
        body: 'Swagger UI on the gateway documents every route, generated from the shared DTOs.',
        href: `${(import.meta.env.VITE_API_URL as string | undefined) ?? ''}/api/docs`,
        cta: 'Swagger UI',
    },
];

const FAQ = [
    {
        q: 'How do I provision a tenant?',
        a: 'Press New tenant on the Overview or Tenants page. You land on the tenant page and can watch each stage go from pending to done, usually in about four seconds.',
    },
    {
        q: 'What does Stalled mean?',
        a: `A stage has been in progress for more than ${STALL_AFTER_MS / 1000} seconds with no change. Workers reject failed messages without requeue, so the message was most likely dead-lettered to ${DLX} and the stage will not finish on its own.`,
    },
    {
        q: 'What happens to a stalled tenant?',
        a: 'You can cancel it from its page, the board or Dead letters. If you do nothing, tenant-service sweeps every five minutes and cancels pipelines that have been stuck for 30.',
    },
    {
        q: 'Can I retry a failed step?',
        a: "Not from the dashboard. Replaying a dead-lettered message isn't exposed by the API, so the usual path is to cancel or delete the tenant and provision it again.",
    },
    {
        q: 'Why does Services say NO SIGNAL for a worker?',
        a: 'Workers have no browser-facing health check. Their status comes from the last event they produced, and NO SIGNAL means none appears in the latest 200 events.',
    },
];

export default function Support() {
    const { user } = useAuth();
    const subject = encodeURIComponent('Liftoff support request');
    const body = encodeURIComponent(`Hello,\n\nI need help with:\n\n\n---\nUser: ${user?.email ?? 'unknown'}\nWorkspace tenant: ${user?.tenantId ?? 'unknown'}`);

    return (
        <div className="max-w-5xl">
            <PageHeader sheet="08" eyebrow="Help" title="Help" lede="Where to read more, where to report problems, and answers to the questions the dashboard raises." />

            <div className="mb-8 grid gap-px overflow-hidden rounded-md border border-ink/70 bg-rule md:grid-cols-3">
                {LINKS.map((l) => (
                    <a key={l.n} href={l.href} target="_blank" rel="noreferrer" className="group flex flex-col bg-card px-5 py-5 transition-colors hover:bg-paper">
                        <span className="mb-3 inline-flex h-7 w-7 items-center justify-center rounded-sm border border-ink font-mark text-[10px]">{l.n}</span>
                        <span className="font-cond text-[21px] font-semibold leading-tight text-ink">{l.title}</span>
                        <span className="mt-1.5 flex-1 text-[14px] text-ink-2">{l.body}</span>
                        <span className="mt-4 inline-flex items-center gap-1 text-[13.5px] font-medium text-blueprint group-hover:underline">
                            {l.cta} <ArrowUpRight size={14} />
                        </span>
                    </a>
                ))}
            </div>

            <Panel fig="8.1" title="Questions" flush className="mb-8">
                <ol className="divide-y divide-rule">
                    {FAQ.map((f, i) => (
                        <li key={f.q} className="grid gap-x-5 gap-y-1 px-4 py-4 sm:grid-cols-[36px_minmax(0,1fr)] sm:px-5">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-ink font-mono text-[12px] font-medium">
                                {i + 1}
                            </span>
                            <div>
                                <h3 className="text-[16px] font-semibold text-ink">{f.q}</h3>
                                <p className="mt-1 max-w-3xl text-[14.5px] leading-relaxed text-ink-2">{f.a}</p>
                            </div>
                        </li>
                    ))}
                </ol>
            </Panel>

            <div className="flex flex-col items-start gap-4 rounded-md border border-dashed border-rule-strong bg-card/70 px-5 py-5 sm:flex-row sm:items-center">
                <div className="flex-1">
                    <p className="font-cond text-[21px] font-semibold text-ink">Still stuck?</p>
                    <p className="text-[14.5px] text-ink-2">Email the maintainer. Your user and workspace IDs are filled in for you.</p>
                </div>
                <a href={`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`} className={buttonClass('primary', 'md')}>
                    <Mail size={15} /> Write an email
                </a>
            </div>
        </div>
    );
}
