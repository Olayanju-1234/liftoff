import { Link } from 'react-router-dom';
import SiteShell from '../components/site/SiteShell';
import DocShell, { DocSection } from '../components/site/DocShell';
import { LEGAL_EFFECTIVE, OPERATOR, REPO, SITE_HOST, SUPPORT_EMAIL } from '../components/site/site';

const TOC = [
    { id: 'who', label: 'Who you are dealing with' },
    { id: 'service', label: 'What the service is' },
    { id: 'account', label: 'Your account' },
    { id: 'use', label: 'Acceptable use' },
    { id: 'customers', label: 'Your customers’ data' },
    { id: 'fees', label: 'Fees' },
    { id: 'availability', label: 'Availability and support' },
    { id: 'changes', label: 'Changes and ending the service' },
    { id: 'liability', label: 'Liability' },
    { id: 'contact', label: 'Contact' },
];

export default function Terms() {
    return (
        <SiteShell sheet="4">
            <DocShell
                sheet="L1"
                eyebrow="Legal"
                title="Terms of service"
                lede="Plain-language terms for the hosted Liftoff service. If something here is unclear, email and ask; the answer counts."
                meta={
                    <>
                        <span>Effective {LEGAL_EFFECTIVE}</span>
                        <span>Applies to {SITE_HOST} and api.{SITE_HOST}</span>
                        <span>
                            Companion:{' '}
                            <Link to="/privacy" className="link">
                                Privacy policy
                            </Link>
                        </span>
                    </>
                }
                toc={TOC}
            >
                <DocSection id="who" n="01" title="Who you are dealing with">
                    <p>
                        Liftoff at <strong className="font-medium text-ink">{SITE_HOST}</strong> is operated by {OPERATOR}, an individual software engineer, not a registered
                        company. “We” and “us” in these terms means {OPERATOR}. “You” means the person who creates an account and, where you act for one, the company you
                        act for.
                    </p>
                    <p>By creating an account or calling the API you agree to these terms and to the privacy policy.</p>
                </DocSection>

                <DocSection id="service" n="02" title="What the service is">
                    <p>
                        Liftoff provisions customer accounts (“tenants”) for your software product. When you ask it to, it creates an isolated database schema, records an
                        address, issues an API key, records a trial subscription and marks the tenant active, and shows your team the result on a dashboard.
                    </p>
                    <p>
                        The service is early. Anything marked “coming soon” or “next release” on the site is a plan, not a promise, and you should not rely on it until it is
                        live. The source code is public at{' '}
                        <a href={REPO} target="_blank" rel="noreferrer" className="link">
                            {REPO.replace('https://', '')}
                        </a>
                        , and the site describes the behaviour of that code honestly, including the parts that are simulated on the hosted service.
                    </p>
                </DocSection>

                <DocSection id="account" n="03" title="Your account">
                    <ul className="list-disc space-y-1.5 pl-5">
                        <li>Give a working email address. It is how we reach you about your account and how you prove you own it.</li>
                        <li>Keep your password and any API keys secret. Activity under your account is treated as yours until you tell us otherwise.</li>
                        <li>One account per person. Today an account represents one company; team members and roles are not yet available.</li>
                        <li>You must be at least 16 and able to enter into an agreement on behalf of your company if you use the service for one.</li>
                    </ul>
                </DocSection>

                <DocSection id="use" n="04" title="Acceptable use">
                    <p>Use the service for provisioning customers of your own product. Do not:</p>
                    <ul className="list-disc space-y-1.5 pl-5">
                        <li>try to read, change or guess tenants, keys or data that belong to another account;</li>
                        <li>run load tests or scripts that create tenants in bulk on the free tier without asking first (one virtual server runs everything);</li>
                        <li>work around rate limits, authentication or quotas;</li>
                        <li>use it for anything unlawful, or to provision a product that is itself unlawful or abusive.</li>
                    </ul>
                    <p>If we see abuse we may suspend the account first and email you second. We will always tell you what happened.</p>
                </DocSection>

                <DocSection id="customers" n="05" title="Your customers’ data">
                    <p>
                        What you send to <code className="font-mono text-[13.5px] text-ink">POST /tenants</code> is the tenant’s name, subdomain and plan. Those, the
                        step statuses and the event log are stored on our server. For that data you decide what is sent and why, and we only process it to run the service
                        for you.
                    </p>
                    <p>
                        Do not put personal data about your customers into tenant names or subdomains beyond what is needed to identify the account. The tenant’s own
                        database schema is created empty; today nothing of your product’s data is written into it by us.
                    </p>
                </DocSection>

                <DocSection id="fees" n="06" title="Fees">
                    <p>
                        Every account is on the Free plan today, and nothing is charged. When the Pro plan goes live we will publish its price on the{' '}
                        <Link to="/pricing" className="link">
                            pricing page
                        </Link>{' '}
                        and ask you to opt in and provide a card before anything is billed. We will never move you to a paid plan without you choosing it.
                    </p>
                </DocSection>

                <DocSection id="availability" n="07" title="Availability and support">
                    <p>
                        The hosted service runs on a single virtual server and is maintained by one person. There is no uptime guarantee and no service-level agreement.
                        Deploys may cause short interruptions, usually seconds. Provisioning that was in flight during an interruption is either completed or cancelled
                        within 30 minutes by the stuck-pipeline sweeper, and the dashboard shows which.
                    </p>
                    <p>
                        Support is by email at{' '}
                        <a href={`mailto:${SUPPORT_EMAIL}`} className="link">
                            {SUPPORT_EMAIL}
                        </a>{' '}
                        and through GitHub issues. Replies are best effort, normally within a few days.
                    </p>
                </DocSection>

                <DocSection id="changes" n="08" title="Changes and ending the service">
                    <ul className="list-disc space-y-1.5 pl-5">
                        <li>We may change these terms. Material changes are emailed to the address on your account at least 14 days before they apply.</li>
                        <li>
                            We may change or retire features. If we ever shut the hosted service down we will give at least 30 days’ notice by email and leave the export and
                            deletion routes described in the privacy policy working until the end.
                        </li>
                        <li>
                            You can stop at any time: delete your tenants from the dashboard and ask for your account to be deleted from the{' '}
                            <Link to="/support" className="link">
                                support page
                            </Link>{' '}
                            or by email. Deletion is described in the privacy policy.
                        </li>
                    </ul>
                </DocSection>

                <DocSection id="liability" n="09" title="Liability">
                    <p>
                        The service is provided as is, free of charge today, without warranties of any kind, to the extent the law allows. We are not liable for indirect
                        loss, lost profit or lost data arising from your use of the service. Where liability cannot be excluded, our total liability to you is limited to the
                        fees you paid us in the twelve months before the claim, which for a Free account is nothing.
                    </p>
                    <p>Nothing in these terms limits liability that cannot lawfully be limited.</p>
                </DocSection>

                <DocSection id="contact" n="10" title="Contact">
                    <p>
                        {OPERATOR} ·{' '}
                        <a href={`mailto:${SUPPORT_EMAIL}`} className="link">
                            {SUPPORT_EMAIL}
                        </a>{' '}
                        · GitHub issues at{' '}
                        <a href={`${REPO}/issues`} target="_blank" rel="noreferrer" className="link">
                            {REPO.replace('https://', '')}/issues
                        </a>
                        .
                    </p>
                </DocSection>
            </DocShell>
        </SiteShell>
    );
}
