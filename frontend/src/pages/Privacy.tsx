import { Link } from 'react-router-dom';
import SiteShell from '../components/site/SiteShell';
import DocShell, { DefList, DocSection } from '../components/site/DocShell';
import { LEGAL_EFFECTIVE, OPERATOR, SITE_HOST, SUPPORT_EMAIL } from '../components/site/site';

const TOC = [
    { id: 'scope', label: 'Who this covers' },
    { id: 'stored', label: 'What we store' },
    { id: 'not-collected', label: 'What we do not collect' },
    { id: 'why', label: 'Why we store it' },
    { id: 'processors', label: 'Who else touches it' },
    { id: 'retention', label: 'How long we keep it' },
    { id: 'rights', label: 'Your rights and deletion' },
    { id: 'security', label: 'Security' },
    { id: 'changes', label: 'Changes' },
    { id: 'contact', label: 'Contact' },
];

export default function Privacy() {
    return (
        <SiteShell sheet="5">
            <DocShell
                sheet="L2"
                eyebrow="Legal"
                title="Privacy policy"
                lede="What the hosted Liftoff service stores about you and your tenants, where it lives, and how to get it deleted. Written from the database schema, not from a template."
                meta={
                    <>
                        <span>Effective {LEGAL_EFFECTIVE}</span>
                        <span>Controller: {OPERATOR}</span>
                        <span>
                            Companion:{' '}
                            <Link to="/terms" className="link">
                                Terms of service
                            </Link>
                        </span>
                    </>
                }
                toc={TOC}
            >
                <DocSection id="scope" n="01" title="Who this covers">
                    <p>
                        This policy covers the website and API at {SITE_HOST}, operated by {OPERATOR} as an individual. It covers you, the account holder, and the tenant
                        records you create. For tenant records you decide what is sent; we store and process them only to run the service for you.
                    </p>
                </DocSection>

                <DocSection id="stored" n="02" title="What we store">
                    <p>Everything below sits in one PostgreSQL database on our server. There is nothing else.</p>
                    <DefList
                        rows={[
                            [
                                'Account',
                                'Your email address, your name if you gave one, a hash of your password (never the password), the refresh token for your current session, and your notification preferences. If you change your email, the new address and a one-time confirmation token are held until you confirm.',
                            ],
                            ['Company', 'The company (workspace) name and subdomain you chose at sign-up, and your role in it.'],
                            [
                                'Tenant records',
                                'For each tenant you provision: its name, subdomain, plan, overall status, the status of each of the five steps, timestamps, and a cancellation reason if it was cancelled.',
                            ],
                            [
                                'Event log',
                                'One row per provisioning event: the event type, a status (Success, Warning or Error), the time, and a small payload holding the tenant ID, subdomain and plan, plus an error message when a step failed.',
                            ],
                            [
                                'Resources made for tenants',
                                'An empty database schema named after the tenant, and an API key for the tenant held in a separate credentials schema. Nothing from your product is written into them by us.',
                            ],
                            [
                                'Server logs',
                                'The API records each request’s IP address, path, status code, timing and user agent for debugging and abuse detection. They stay on the server.',
                            ],
                        ]}
                    />
                </DocSection>

                <DocSection id="not-collected" n="03" title="What we do not collect">
                    <ul className="list-disc space-y-1.5 pl-5">
                        <li>No analytics, no advertising, no tracking pixels, no third-party scripts on any page.</li>
                        <li>No cookies. The dashboard keeps your session tokens and a view preference in your browser’s local storage, and nothing else.</li>
                        <li>No payment details. Billing on the hosted service is simulated today; no card is collected anywhere.</li>
                        <li>No data about your customers beyond the tenant name, subdomain and plan that you send us.</li>
                    </ul>
                </DocSection>

                <DocSection id="why" n="04" title="Why we store it">
                    <ul className="list-disc space-y-1.5 pl-5">
                        <li>To run the service: sign you in, provision tenants, show you their state and history.</li>
                        <li>To keep it safe: rate limiting by IP, finding abuse, debugging failures.</li>
                        <li>To talk to you about your account: confirming an email change, and later, notices about terms or the service. No marketing email.</li>
                    </ul>
                </DocSection>

                <DocSection id="processors" n="05" title="Who else touches it">
                    <DefList
                        rows={[
                            ['Oracle Cloud', 'Hosts the virtual server in Europe that runs the API, the database and the message queue. All data at rest is there.'],
                            ['Resend', 'Sends transactional email (today: email-change confirmations) from an EU region. Resend sees the recipient address and the message.'],
                            ['Cloudflare', 'Manages DNS for the ojusentinel.com domain.'],
                            ['Stripe', 'Only if billing is connected. On the hosted service it is not connected today, so Stripe receives nothing.'],
                            ['GitHub', 'If you open an issue, GitHub’s own terms apply to what you post there.'],
                        ]}
                    />
                    <p>We do not sell data and do not share it with anyone else, unless the law requires it.</p>
                </DocSection>

                <DocSection id="retention" n="06" title="How long we keep it">
                    <ul className="list-disc space-y-1.5 pl-5">
                        <li>Account and company data: for as long as the account exists.</li>
                        <li>
                            Tenant records and their event log: until you delete the tenant. Deleting removes the tenant row and its events immediately. The tenant’s database
                            schema and API key are cleaned up by the operator; ask if you want that confirmed for a specific tenant.
                        </li>
                        <li>Pending email-change tokens: until used or expired.</li>
                        <li>Server logs: rotated by the operating system on the server; they are not exported or archived elsewhere.</li>
                    </ul>
                </DocSection>

                <DocSection id="rights" n="07" title="Your rights and deletion">
                    <p>
                        You can see and correct your name, email and preferences in Settings, and delete tenants from the dashboard yourself. For anything else, ask from
                        the{' '}
                        <Link to="/support" className="link">
                            support page
                        </Link>{' '}
                        (it pre-fills your account ID) or email{' '}
                        <a href={`mailto:${SUPPORT_EMAIL}`} className="link">
                            {SUPPORT_EMAIL}
                        </a>
                        :
                    </p>
                    <ul className="list-disc space-y-1.5 pl-5">
                        <li>
                            <strong className="font-medium text-ink">Export</strong>: a JSON copy of your account, tenants and event log.
                        </li>
                        <li>
                            <strong className="font-medium text-ink">Deletion</strong>: your account, company, tenants, their event logs, schemas and keys are removed. We confirm by
                            email when it is done.
                        </li>
                    </ul>
                    <p>We answer within 30 days, normally much sooner. If you are in the EU or UK you also have the right to complain to your data protection authority.</p>
                </DocSection>

                <DocSection id="security" n="08" title="Security">
                    <ul className="list-disc space-y-1.5 pl-5">
                        <li>All traffic to the site and API is over HTTPS.</li>
                        <li>Passwords are stored as salted hashes. Sessions use short-lived access tokens with rotating refresh tokens.</li>
                        <li>Every tenant request is scoped to the signed-in account; you cannot read another account’s tenants or events.</li>
                        <li>Per-IP rate limits on sign-in, sign-up and the API.</li>
                        <li>
                            If we learn of a breach affecting your data we will email you within 72 hours of confirming it, with what was involved and what we did.
                        </li>
                    </ul>
                </DocSection>

                <DocSection id="changes" n="09" title="Changes">
                    <p>
                        The effective date at the top changes when this policy does. If a change means we store something new or share it with someone new, we email you
                        before it takes effect.
                    </p>
                </DocSection>

                <DocSection id="contact" n="10" title="Contact">
                    <p>
                        {OPERATOR} ·{' '}
                        <a href={`mailto:${SUPPORT_EMAIL}`} className="link">
                            {SUPPORT_EMAIL}
                        </a>
                    </p>
                </DocSection>
            </DocShell>
        </SiteShell>
    );
}
