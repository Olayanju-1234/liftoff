import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import SiteShell, { Code } from '../components/site/SiteShell';
import DocShell, { DefList, DocSection } from '../components/site/DocShell';
import CodeBlock from '../components/site/CodeBlock';
import { API_BASE, REPO, SWAGGER_URL } from '../components/site/site';
import { STAGES, STALL_AFTER_MS } from '../lib/pipeline';
import { buttonClass } from '../lib/ui';

const TOC = [
    { id: 'quickstart', label: 'Quickstart' },
    { id: 'auth', label: 'Authentication' },
    { id: 'steps', label: 'The five steps' },
    { id: 'custom-steps', label: 'Custom steps' },
    { id: 'status', label: 'Status and polling' },
    { id: 'idempotency', label: 'Idempotency' },
    { id: 'test-mode', label: 'Test mode' },
    { id: 'webhooks', label: 'Webhooks and signatures' },
    { id: 'status-page', label: 'Status page' },
    { id: 'errors', label: 'Errors' },
    { id: 'limits', label: 'Rate limits' },
    { id: 'reference', label: 'API reference' },
];

const CREATE = `curl -X POST ${API_BASE}/tenants \\
  -H "Authorization: Bearer $LIFTOFF_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: signup-7f3c2a9e" \\
  -d '{
    "name": "Globex",
    "subdomain": "globex",
    "planId": "starter"
  }'`;

const CREATE_TEST = `curl -X POST ${API_BASE}/tenants \\
  -H "Authorization: Bearer $LIFTOFF_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "name": "Globex (test)", "subdomain": "globextest", "planId": "starter", "test": true }'

# 202 … "isTest": true, and once ready: "billingStatus": "SKIPPED"`;

const IDEMPOTENT_RETRY = `# First attempt timed out on your side; send the same request with the same key.
curl -i -X POST ${API_BASE}/tenants \\
  -H "Authorization: Bearer $LIFTOFF_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: signup-7f3c2a9e" \\
  -d '{ "name": "Globex", "subdomain": "globex", "planId": "starter" }'

HTTP/1.1 202 Accepted
Idempotent-Replayed: true

{ "id": "cm2k7x1q90000abcd1234efgh", "name": "Globex", "status": "PROVISIONING", … }`;

const CREATE_RESPONSE = `HTTP/1.1 202 Accepted
Content-Type: application/json

{
  "id": "cm2k7x1q90000abcd1234efgh",
  "name": "Globex",
  "subdomain": "globex",
  "status": "PROVISIONING",
  "planId": "starter",
  "dbStatus": "PENDING",
  "dnsStatus": "PENDING",
  "credentialsStatus": "PENDING",
  "billingStatus": "PENDING",
  "notificationStatus": "PENDING",
  "statusUrl": "https://liftoff.ojusentinel.com/status/8qkM3v…",
  "createdAt": "2026-10-17T09:41:03.120Z",
  "updatedAt": "2026-10-17T09:41:03.120Z"
}`;

const WEBHOOK_REQUEST = `POST /liftoff/webhook HTTP/1.1
Host: api.globex.com
Content-Type: application/json
User-Agent: Liftoff-Webhooks/1.0
x-liftoff-event: tenant.active
x-liftoff-delivery: 3f1c2a9e-5d7b-4c1e-9a0f-2b6d8e4f1a7c
x-liftoff-signature: sha256=9b2f6c0e1a4d7f3b8c5e2a1d9f0b4c7e6a3d2f1b0c9e8d7a6b5c4e3f2a1b0c9d

{
  "event": "tenant.active",
  "tenant": {
    "id": "cm2k7x1q90000abcd1234efgh",
    "name": "Globex",
    "subdomain": "globex",
    "status": "ACTIVE",
    "planId": "starter",
    "dbStatus": "SUCCESS",
    "dnsStatus": "SUCCESS",
    "credentialsStatus": "SUCCESS",
    "billingStatus": "SUCCESS",
    "notificationStatus": "SUCCESS",
    "address": "globex.acme.app",
    "statusUrl": "https://liftoff.ojusentinel.com/status/8qkM3v…",
    "createdAt": "2026-10-17T09:41:03.120Z",
    "updatedAt": "2026-10-17T09:41:07.310Z"
  }
}`;

const VERIFY = `import { createHmac, timingSafeEqual } from 'node:crypto';

// rawBody must be the exact bytes received, not a re-serialised object.
export function verifyLiftoff(rawBody: string, header: string | undefined, secret: string) {
  const expected = Buffer.from('sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex'));
  const given = Buffer.from(header ?? '');
  return expected.length === given.length && timingSafeEqual(expected, given);
}`;

const STATUS_PAGE = `curl ${API_BASE}/status/8qkM3v…   # no credentials

{
  "company": "Acme",
  "name": "Globex",
  "state": "setting-up",
  "done": 3,
  "total": 5,
  "steps": [
    { "name": "Creating your database", "state": "done" },
    { "name": "Setting up your address", "state": "done" },
    { "name": "Generating your API keys", "state": "done" },
    { "name": "Starting your trial", "state": "in-progress" },
    { "name": "Finishing up", "state": "waiting" }
  ],
  "address": null,
  "updatedAt": "2026-10-17T09:41:05.880Z"
}`;

const LOGIN = `curl -X POST ${API_BASE}/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{ "email": "you@company.com", "password": "********" }'

# { "accessToken": "eyJ…", "refreshToken": "…", "user": { "id": "…", "email": "…" } }
export LIFTOFF_TOKEN="eyJ…"   # the accessToken, valid for 15 minutes`;

const CREATE_KEY = `curl -X POST ${API_BASE}/api-keys \\
  -H "Authorization: Bearer $LIFTOFF_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "name": "signup service" }'

# { "id": "…", "name": "signup service", "prefix": "lk_8f3kQ2wZx", "key": "lk_…", "lastUsedAt": null, "createdAt": "…" }
export LIFTOFF_KEY="lk_…"   # shown once; store it in your signup service's secrets`;

const SET_WEBHOOK = `curl -X PUT ${API_BASE}/organisation \\
  -H "Authorization: Bearer $LIFTOFF_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "webhookUrl": "https://api.globex.com/liftoff/webhook" }'

# { "id": "…", "name": "Globex", "handle": "globex", "baseDomain": null, "webhookUrl": "https://api.globex.com/liftoff/webhook", "webhookConfigured": true, "webhookSecret": "whsec_…" }
# webhookSecret is in this response only; send { "rotateWebhookSecret": true } to get a new one`;

const POLL = `curl ${API_BASE}/tenants/cm2k7x1q90000abcd1234efgh \\
  -H "Authorization: Bearer $LIFTOFF_KEY"

# "status": "ACTIVE" when all five step statuses are SUCCESS`;

const SET_STEPS = `curl -X PUT ${API_BASE}/organisation \\
  -H "Authorization: Bearer $LIFTOFF_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "stepConfig": {
      "database": { "mode": "custom", "url": "https://api.globex.com/liftoff/steps", "timeoutMs": 600000 },
      "billing": { "mode": "skipped" }
    }
  }'

# "stepConfig": { "database": { "mode": "custom", "url": "https://api.globex.com/liftoff/steps", "timeoutMs": 600000 },
#                 "address": { "mode": "builtin", "url": null, "timeoutMs": 600000 }, … }`;

const STEP_REQUEST = `POST /liftoff/steps HTTP/1.1
Host: api.globex.com
Content-Type: application/json
User-Agent: Liftoff-Webhooks/1.0
x-liftoff-event: step.requested
x-liftoff-delivery: 7c2e9a1f-0b4d-4e6a-8f3c-5d1b2a9e7f40
x-liftoff-signature: sha256=4e1a…

{
  "event": "step.requested",
  "step": "database",
  "requestId": "cm2k7x4t20001abcd9876wxyz",
  "callbackUrl": "${API_BASE}/tenants/cm2k7x1q90000abcd1234efgh/steps/database",
  "deadline": "2026-10-17T09:51:03.400Z",
  "tenant": {
    "id": "cm2k7x1q90000abcd1234efgh",
    "name": "Globex",
    "subdomain": "globex",
    "planId": "starter",
    "isTest": false,
    "address": "globex.acme.app",
    …
  }
}`;

const STEP_CALLBACK = `# Done: the step is SUCCESS and the next one starts
curl -X POST "$CALLBACK_URL/complete" \\
  -H "x-api-key: $LIFTOFF_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "requestId": "cm2k7x4t20001abcd9876wxyz", "output": { "databaseId": "db_123", "region": "eu-west-1" } }'

# { "tenantId": "cm2k7x1q90000abcd1234efgh", "step": "database", "action": "provision", "outcome": "recorded", "status": "PROVISIONING" }

# Could not do it: the step and the customer are FAILED with your reason
curl -X POST "$CALLBACK_URL/fail" \\
  -H "x-api-key: $LIFTOFF_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "requestId": "cm2k7x4t20001abcd9876wxyz", "error": "No capacity left in eu-west-1" }'`;

const ERROR_BODY = `{ "statusCode": 409, "message": "A tenant with this name or subdomain already exists", "error": "Conflict" }`;

const STEP_NOTES: Record<string, { plain: string; honest?: string }> = {
    dbStatus: {
        plain: 'Creates an empty PostgreSQL schema named tenant_<subdomain> in our database. Nothing else can see it, and nothing is written into it by us. If the schema already exists the step fails instead of reusing it.',
    },
    dnsStatus: {
        plain: 'Records <subdomain> as the tenant’s address so your product has somewhere to send the customer immediately after sign-up. Every tenant response carries it as address: <subdomain>.<your base domain>, set in Settings, or <subdomain>.liftoff.ojusentinel.com until you set one.',
        honest: 'Today the record lives in our table and no public DNS is changed; the address is informational and your product decides what to do with it. Subdomains are unique within your company, not across Liftoff.',
    },
    credentialsStatus: {
        plain: 'Generates an sk_live_ API key for the tenant and stores it in a separate credentials schema. A redelivered message republishes rather than issuing a second key.',
        honest: 'The API does not return this key yet, so the dashboard shows it masked. Surfacing it to you, and rotating it, is on the roadmap.',
    },
    billingStatus: {
        plain: 'Creates a customer and a subscription with a 14-day trial in your own Stripe account, on the Price ID you set for the tenant’s customer plan (PUT /organisation { stripeSecretKey, stripePrices }, or Settings → Billing). The key is stored encrypted and never returned.',
        honest: 'Until you connect Stripe the step is recorded as SKIPPED, not simulated: no customer, no subscription, and the dashboard says "Billing: not connected". A plan without a price fails the step with the reason in the event log.',
    },
    notificationStatus: {
        plain: 'Emails your team "<Customer> is ready" (address, plan, a link to the customer), publishes provisioning.complete, and the tenant becomes ACTIVE. If a step fails you get "<Customer> needs attention" with the reason. Recipients are your users with a verified email and the matching toggle on under Settings → Notifications.',
        honest: 'Nothing is sent to your customer: their welcome is yours to send from the tenant.active webhook, in your own voice. The step reads SKIPPED when nobody in your company could be emailed.',
    },
};

const LIMITS: [string, string, string][] = [
    ['POST /auth/register', '5 / minute', 'per IP'],
    ['POST /auth/login', '10 / minute', 'per IP'],
    ['POST /auth/forgot-password', '5 / minute', 'per IP'],
    ['POST /auth/reset-password', '10 / minute', 'per IP'],
    ['POST /auth/verify-email', '10 / minute', 'per IP'],
    ['POST /auth/resend-verification', '5 / minute', 'per IP'],
    ['POST /settings/email/confirm', '10 / minute', 'per IP'],
    ['GET /status/:token', '60 / minute', 'per IP, no credentials'],
    ['Every other route', '100 / minute', 'per IP, all routes combined'],
    ['GET /health', 'unlimited', ''],
];

const ERRORS: [string, string, string][] = [
    ['400', 'Bad request', 'A body field failed validation (name ≤ 100 chars; subdomain letters only, ≤ 30), planId is not one of your customer plans (the message lists them), or an :id is not a CUID.'],
    ['401', 'Unauthorized', 'No Authorization or x-api-key header, the API key was revoked, or the token is invalid or expired. Access tokens last 15 minutes; use POST /auth/refresh or sign in again. An API key on a route that needs a signed-in user also answers 401.'],
    ['403', 'Forbidden', 'POST /api-keys before the signup email is verified. Open the link from the email, or resend it from the dashboard banner.'],
    ['404', 'Not found', 'No tenant with that ID belongs to your account. Another account’s tenant also answers 404, never 403.'],
    ['409', 'Conflict', 'The tenant name or subdomain is already used by another of your tenants (another company may use the same one), or at sign-up the email or handle is taken. On a custom step callback: the step is not waiting on your system, already failed, or the requestId is not the latest.'],
    ['429', 'Too many requests', 'You hit a rate limit or a quota (next section). Retry-After says how many seconds to wait; the message says which limit and what to do.'],
    ['422', 'Unprocessable', 'An Idempotency-Key was reused with a different body. Use a new key for a new request.'],
    ['502 / 503', 'Upstream unavailable', 'The gateway could not reach the tenant service, usually during a deploy. Safe to retry after a few seconds; send the same Idempotency-Key on POST /tenants so the retry cannot create a second tenant.'],
];

const ENDPOINTS: [string, string, string][] = [
    ['POST', '/auth/register', 'Create an account and its company; emails a verification link'],
    ['POST', '/auth/verify-email', 'Verify the signup email with the token from the link'],
    ['POST', '/auth/resend-verification', 'Send the signed-in user a new verification link'],
    ['POST', '/auth/forgot-password', 'Email a password reset link (always 200)'],
    ['POST', '/auth/reset-password', 'Set a new password with the token from the link'],
    ['POST', '/auth/login', 'Exchange email and password for tokens'],
    ['POST', '/auth/refresh', 'Exchange a refresh token for a new access token'],
    ['POST', '/auth/logout', 'Invalidate the current refresh token'],
    ['GET', '/auth/me', 'The signed-in user'],
    ['POST', '/tenants', 'Create a tenant and start provisioning (202). Takes an Idempotency-Key; test: true for test mode'],
    ['GET', '/tenants', 'List your tenants with step statuses'],
    ['GET', '/tenants/:id', 'One tenant with its plan and last 100 events'],
    ['GET', '/tenants/:id/events', 'Event log for one tenant (latest 200)'],
    ['GET', '/events', 'Event log across all your tenants (latest 200)'],
    ['POST', '/tenants/:id/retry', 'Run the failed step of a FAILED tenant again (a custom step gets a new step.requested); finished steps are kept'],
    ['POST', '/tenants/:id/steps/:step/complete', 'Custom step callback: your system did the step (API key)'],
    ['POST', '/tenants/:id/steps/:step/fail', 'Custom step callback: your system could not do the step'],
    ['POST', '/tenants/:id/steps/:step/teardown/…', 'complete or fail: your system undid the step after a removal'],
    ['POST', '/tenants/:id/cancel', 'Stop a tenant that is still provisioning; from ACTIVE or FAILED, remove it like DELETE'],
    ['DELETE', '/tenants/:id', 'Remove a tenant: drop its schema, revoke its API key, cancel its Stripe subscription. Ends DELETED; events are kept'],
    ['GET / PUT', '/organisation', 'Your company: name, base domain, webhook URL (PUT returns the signing secret once), Stripe key (never returned), your customer plans and a price per plan, and how each step runs (stepConfig: builtin, skipped or custom)'],
    ['GET / PUT', '/settings', 'Your profile and notification preferences'],
    ['POST', '/api-keys', 'Create a company API key (returned once)'],
    ['GET', '/api-keys', 'List your API keys by name and prefix, never the key'],
    ['DELETE', '/api-keys/:id', 'Revoke an API key'],
    ['GET', '/status/:token', 'Public: a tenant’s setup progress in plain words for your customer; no credentials'],
];

export default function Docs() {
    return (
        <SiteShell sheet="3">
            <DocShell
                sheet="D1"
                eyebrow="Documentation"
                title="Docs"
                lede="Everything you need to plug Liftoff into a signup flow: one request, one webhook, and what each of the five steps actually does on the hosted service."
                meta={
                    <>
                        <span>Base URL {API_BASE}</span>
                        <span>JSON in, JSON out</span>
                        <span>
                            <a href={SWAGGER_URL} target="_blank" rel="noreferrer" className="link">
                                Swagger reference
                            </a>
                        </span>
                    </>
                }
                toc={TOC}
            >
                <DocSection id="quickstart" n="01" title="Quickstart">
                    <p>Three steps: a key for your signup service, one request per new customer, and a webhook when the tenant is ready.</p>

                    <QuickStep n="1" title="Create an API key">
                        <p>
                            Sign in once and <Code>POST /api-keys</Code> with a name for your signup service. Keys start with <Code>lk_</Code>, are shown once, and are sent either as{' '}
                            <Code>Authorization: Bearer lk_…</Code> or in an <Code>x-api-key</Code> header. A key acts for your whole company; revoke it with{' '}
                            <Code>DELETE /api-keys/:id</Code>. See{' '}
                            <a href="#auth" className="link">
                                Authentication
                            </a>{' '}
                            for the sign-in step.
                        </p>
                        <CodeBlock code={CREATE_KEY} title="Create a key" lang="curl" />
                    </QuickStep>

                    <QuickStep n="2" title="Create a tenant from your signup flow">
                        <p>
                            One request per new customer. <Code>name</Code> is what your support team will see, <Code>subdomain</Code> is letters only and becomes the schema and
                            address, <Code>planId</Code> is the customer’s plan on <em>your</em> product: <Code>starter</Code>, <Code>pro</Code> or <Code>enterprise</Code> unless
                            you defined your own customer plans under Settings → Billing (<Code>{'PUT /organisation { plans }'}</Code>), in which case only those ids are
                            accepted. Every response carries <Code>planName</Code>, the plan as you named it.
                        </p>
                        <CodeBlock code={CREATE} title="Request" lang="curl" />
                        <p>You get a 202 immediately with the tenant in <Code>PROVISIONING</Code>. The five steps run in the background and are usually done in about four seconds.</p>
                        <CodeBlock code={CREATE_RESPONSE} title="Response" lang="http" />
                    </QuickStep>

                    <QuickStep n="3" title="Receive the webhook">
                        <p>
                            Set a webhook URL with <Code>PUT /organisation</Code> (or under{' '}
                            <Link to="/settings#webhook" className="link">
                                Settings → Webhook
                            </Link>
                            ) and Liftoff POSTs <Code>tenant.active</Code> when all five steps succeed, or{' '}
                            <Code>tenant.failed</Code> when one fails for good. The body is the same tenant object you got in step 2, with final statuses. Verify the signature before trusting it; see{' '}
                            <a href="#webhooks" className="link">
                                Webhooks and signatures
                            </a>
                            .
                        </p>
                        <CodeBlock code={WEBHOOK_REQUEST} title="Delivery" lang="http" />
                    </QuickStep>
                </DocSection>

                <DocSection id="auth" n="02" title="Authentication">
                    <p>
                        Services authenticate with a company API key. Keys start with <Code>lk_</Code>, are created with <Code>POST /api-keys</Code> while signed in (or under{' '}
                        <Link to="/settings#api-keys" className="link">
                            Settings → API keys
                        </Link>
                        ), and are shown once. Send one as <Code>Authorization: Bearer lk_…</Code> or in an <Code>x-api-key</Code> header. A key acts for your whole company, never expires, and is
                        accepted on <Code>POST /tenants</Code>, <Code>GET /tenants/:id</Code> and the custom step callbacks; every other route needs a signed-in user and
                        answers 401 to a key.{' '}
                        <Code>GET /api-keys</Code> lists your keys by name and prefix, <Code>DELETE /api-keys/:id</Code> revokes one at once.
                    </p>
                    <p>
                        For trying things from a terminal, the API also accepts the same token the dashboard uses. Sign in, take <Code>accessToken</Code>, and send it as a bearer
                        token. It expires after 15 minutes; <Code>POST /auth/refresh</Code> with the <Code>refreshToken</Code> (valid 7 days, rotated on use) gives you a new one.
                    </p>
                    <CodeBlock code={LOGIN} title="Sign in" lang="curl" />
                    <p>
                        Use a key for anything that runs unattended: a login token is tied to a person, and <Code>POST /auth/login</Code> is rate limited to 10 a minute.
                    </p>
                </DocSection>

                <DocSection id="steps" n="03" title="The five steps">
                    <p>
                        Each step is a separate worker with its own queue. When a step is due, Liftoff sends its worker the input, the worker does one job and reports back,
                        and the next step starts. The tenant record keeps a status per step so you can see exactly where a slow tenant is. Any step can instead be skipped or
                        run by your own system: see{' '}
                        <a href="#custom-steps" className="link">
                            Custom steps
                        </a>
                        .
                    </p>
                    <ol className="space-y-4">
                        {STAGES.map((s) => {
                            const note = STEP_NOTES[s.key];
                            return (
                                <li key={s.key} className="rounded-md border border-rule bg-card p-5 shadow-sheet">
                                    <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                        <span className="font-mark text-[11px] tracking-[0.12em] text-ink">{s.code}</span>
                                        <h3 className="font-cond text-[24px] font-semibold leading-tight text-ink">{s.name}</h3>
                                        <span className="font-mono text-[11.5px] text-ink-3">
                                            {s.service} · {s.consumes} → {s.emits}
                                        </span>
                                    </div>
                                    <p className="text-[14.5px] leading-relaxed text-ink-2">{note.plain}</p>
                                    {note.honest && (
                                        <p className="mt-2 flex items-start gap-2 rounded-sm border border-dashed border-hold/50 bg-hold/[0.05] px-3 py-2 text-[13.5px] text-ink-2">
                                            <span className="label mt-0.5 shrink-0 text-hold">Today</span>
                                            {note.honest}
                                        </p>
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                </DocSection>

                <DocSection id="custom-steps" n="04" title="Custom steps">
                    <p>
                        Liftoff is the control plane: it knows which step is due, retries, times out and shows your support team where every customer is. Who does each
                        step is yours to choose, per step, under{' '}
                        <Link to="/settings#provisioning" className="link">
                            Settings → Provisioning
                        </Link>{' '}
                        or with <Code>{'PUT /organisation { stepConfig }'}</Code>:
                    </p>
                    <DefList
                        rows={[
                            ['builtin', 'Liftoff does it, as described above. The default for every step.'],
                            ['skipped', 'Nobody does it. The step reads SKIPPED and the next one starts at once. Skipping every step makes a customer ACTIVE straight away.'],
                            [
                                'custom',
                                'Your system does it. Liftoff POSTs step.requested to the URL you set and waits for your callback, up to timeoutMs (10 minutes by default, 1 minute to 24 hours).',
                            ],
                        ]}
                    />
                    <p>
                        The steps are <Code>database</Code>, <Code>address</Code>, <Code>credentials</Code>, <Code>billing</Code> and <Code>welcome</Code>. A step you leave
                        out of the request keeps its setting; <Code>null</Code> puts one back to builtin, and <Code>{'"stepConfig": null'}</Code> puts all of them back.
                        Requests are signed with your webhook secret, so{' '}
                        <a href="#webhooks" className="link">
                            set a webhook
                        </a>{' '}
                        first. Settings apply from each customer’s next step, so customers already being set up pick them up as they go.
                    </p>
                    <CodeBlock code={SET_STEPS} title="Configure" lang="curl" />

                    <h3 className="pt-2 font-cond text-[22px] font-semibold text-ink">The request</h3>
                    <p>
                        When a custom step is due, Liftoff POSTs this to your URL, with the same headers, signature and retries as a webhook. Answer with any 2xx straight
                        away and do the work in the background. A 4xx fails the step at once; no 2xx after four attempts fails it too. Test customers call your system as
                        well, with <Code>tenant.isTest: true</Code>.
                    </p>
                    <CodeBlock code={STEP_REQUEST} title="step.requested" lang="http" />

                    <h3 className="pt-2 font-cond text-[22px] font-semibold text-ink">The callback</h3>
                    <p>
                        When the work is done, POST to <Code>callbackUrl</Code> plus <Code>/complete</Code>, or <Code>/fail</Code> with an <Code>error</Code> your support
                        team can act on. Authenticate with a company API key. Send the <Code>requestId</Code> you were given: after a retry a callback for the older request
                        is refused. <Code>output</Code> is optional, a JSON object of at most 4 KB, kept with the step and shown in the event log. Never put secrets in it.
                    </p>
                    <CodeBlock code={STEP_CALLBACK} title="Complete or fail" lang="curl" />
                    <ul className="list-disc space-y-1.5 pl-5">
                        <li>
                            Callbacks are idempotent: the same result again answers <Code>outcome: "duplicate"</Code>. For a customer that was cancelled or removed meanwhile
                            the answer is <Code>outcome: "ignored"</Code> and nothing changes. Both are 200, so you can stop retrying.
                        </li>
                        <li>
                            <Code>409</Code> means the step is not waiting on your system (it is builtin, or not due yet), it already failed or timed out (Retry the customer to
                            get a new request), or <Code>requestId</Code> is not the latest.
                        </li>
                        <li>
                            No callback by <Code>deadline</Code> fails the step with “Your system did not call back within …”, the <Code>tenant.failed</Code> webhook is sent and
                            your team is emailed. <Code>POST /tenants/:id/retry</Code> (or Retry in the dashboard) sends a new <Code>step.requested</Code>, by your settings
                            as they are then.
                        </li>
                    </ul>

                    <h3 className="pt-2 font-cond text-[22px] font-semibold text-ink">Removal</h3>
                    <p>
                        When you remove a customer, every step that ran on your system gets <Code>step.teardown</Code> at the same URL, even if the step failed, so partial
                        work can be cleaned up. Its <Code>callbackUrl</Code> ends in <Code>/teardown</Code>: POST <Code>/complete</Code> or <Code>/fail</Code> to it the same
                        way. The customer reads <Code>DEPROVISIONING</Code> until every part is done, then <Code>DELETED</Code> with the <Code>tenant.deleted</Code>{' '}
                        webhook. A failed or late teardown leaves it removing; removing it again sends a new request. A skipped step has nothing to undo.
                    </p>
                </DocSection>

                <DocSection id="status" n="05" title="Status and polling">
                    <p>
                        If you would rather not receive webhooks, poll <Code>GET /tenants/:id</Code> every couple of seconds. The overall <Code>status</Code> is the one to branch on; the five step
                        statuses tell your support team where it is.
                    </p>
                    <CodeBlock code={POLL} title="Poll" lang="curl" />
                    <DefList
                        rows={[
                            ['PROVISIONING', 'Steps are running. Expect ACTIVE within seconds.'],
                            ['ACTIVE', 'All five steps succeeded. Terminal.'],
                            ['FAILED', 'A step failed for good, made no progress for 2 minutes and was timed out ("Step timed out: …" in the event log), or, for a custom step, your system called /fail or missed its deadline. The step’s own status is FAILED and the event log holds the error. tenant.failed is sent. POST /tenants/:id/retry (or Retry in the dashboard) runs that step again once you have fixed the cause, e.g. a missing Stripe price; or delete it.'],
                            ['CANCELLED', 'You cancelled it, or no step was ever in progress and nothing moved for 30 minutes, so the sweeper did. cancelReason says which. Terminal.'],
                            ['SUSPENDED', 'Reserved for a future pause action; not set by the service today.'],
                            ['DEPROVISIONING', 'You removed it (DELETE, or cancel from ACTIVE/FAILED). Its schema is being dropped, its API key revoked and its Stripe subscription cancelled. The three teardown* fields say how far it got; DELETE again retries any that failed.'],
                            ['DELETED', 'Torn down. tenant.deleted is sent. It leaves GET /tenants but GET /tenants/:id still answers, with deletedAt and its events. Test tenants read DELETED at once. Its name and subdomain can be used again. Terminal.'],
                        ]}
                    />
                    <p>
                        Step statuses are <Code>PENDING</Code>, <Code>IN_PROGRESS</Code>, <Code>SUCCESS</Code>, <Code>FAILED</Code>, <Code>CANCELLED</Code> or{' '}
                        <Code>SKIPPED</Code> (any step you set to skipped; billing on a test tenant or when your company has not connected Stripe; notification when nobody
                        could be emailed). <Code>stepModes</Code> on the tenant says how each step ran. The dashboard additionally shows a builtin step as <em>stalled</em>{' '}
                        when it has been IN_PROGRESS for more than {STALL_AFTER_MS / 1000} seconds; the API does not have that state, so compute it from{' '}
                        <Code>updatedAt</Code> if you need it. A custom step is never stalled: it has its own deadline.
                    </p>
                </DocSection>

                <DocSection id="idempotency" n="06" title="Idempotency">
                    <p>
                        A signup flow that retries on a timeout must not create two tenants. Send an <Code>Idempotency-Key</Code> header on <Code>POST /tenants</Code>: any
                        string up to 255 characters that is unique per request, such as a UUID or your own signup ID. The first response for a key is stored for 24 hours and
                        replayed, with the same status and body, on every repeat.
                    </p>
                    <ul className="list-disc space-y-1.5 pl-5">
                        <li>
                            Keys are scoped to your organisation, so they cannot collide with another company’s.
                        </li>
                        <li>
                            A replay carries <Code>Idempotent-Replayed: true</Code>. The tenant may have moved on since the first response: poll <Code>GET /tenants/:id</Code> for
                            its current status.
                        </li>
                        <li>
                            The same key with a different body gets <Code>422</Code>. Two requests with the same key at the same time: the second gets <Code>409</Code> until the
                            first has finished, then replays it.
                        </li>
                        <li>Only successful responses are stored. If the first attempt fails (a 409 on the subdomain, say), the key is free again.</li>
                    </ul>
                    <CodeBlock code={IDEMPOTENT_RETRY} title="Retry" lang="curl" />
                </DocSection>

                <DocSection id="test-mode" n="07" title="Test mode">
                    <p>
                        Try the flow without touching anything real: send <Code>"test": true</Code> on <Code>POST /tenants</Code>. A test tenant is provisioned exactly like a
                        real one (schema, address, API key, webhook), but the billing step is recorded as <Code>SKIPPED</Code> and no billing call is ever made, it never counts
                        towards your quotas, and you can delete it at any time. It carries <Code>isTest: true</Code> in every response and webhook, and shows a{' '}
                        <strong className="font-medium text-ink">Test</strong> badge in the dashboard.
                    </p>
                    <CodeBlock code={CREATE_TEST} title="Request" lang="curl" />
                </DocSection>

                <DocSection id="webhooks" n="08" title="Webhooks and signatures">
                    <p>
                        Set the URL with <Code>PUT /organisation</Code>. The response carries <Code>webhookSecret</Code> once; store it, it signs every delivery. Send{' '}
                        <Code>webhookUrl: null</Code> to stop deliveries.
                    </p>
                    <CodeBlock code={SET_WEBHOOK} title="Set the URL" lang="curl" />
                    <ul className="list-disc space-y-1.5 pl-5">
                        <li>
                            Events: <Code>tenant.active</Code>, <Code>tenant.failed</Code> and <Code>tenant.deleted</Code> (everything torn down after a removal). Body:{' '}
                            <Code>{'{ "event", "tenant" }'}</Code>, where tenant is the full record.
                        </li>
                        <li>
                            Headers: <Code>x-liftoff-event</Code>, <Code>x-liftoff-delivery</Code> (a UUID per delivery, reuse it to de-duplicate) and{' '}
                            <Code>x-liftoff-signature</Code>.
                        </li>
                        <li>
                            Signature: <Code>sha256=</Code> followed by the hex HMAC-SHA256 of the raw request body, keyed with the signing secret you were shown when you set the
                            URL. Setting a new URL or sending <Code>rotateWebhookSecret: true</Code> issues a new secret; the old one stops working at once.
                        </li>
                        <li>
                            Delivery: a 2xx within the timeout counts as received. A 4xx is not retried. 5xx, timeouts and connection errors are retried with backoff, then
                            given up and logged. Redirects are treated as failures, and private or internal addresses are refused.
                        </li>
                    </ul>
                    <CodeBlock code={VERIFY} title="Verify (Node)" lang="ts" />
                </DocSection>

                <DocSection id="status-page" n="09" title="Status page">
                    <p>
                        Your customer has nothing to look at while their workspace is set up, so every tenant has a public progress page. The link is{' '}
                        <Code>statusUrl</Code> on the <Code>POST /tenants</Code> response, on every tenant record and in every webhook; show it on your
                        own “setting things up” screen, email it, or embed the page. Nobody needs an account to open it.
                    </p>
                    <ul className="list-disc space-y-1.5 pl-5">
                        <li>
                            It says only who is setting them up, their name, the overall state (<Code>setting-up</Code>, <Code>ready</Code>, <Code>needs-attention</Code>,{' '}
                            <Code>stopped</Code>, <Code>removed</Code>), the five steps by plain name with <Code>waiting</Code> / <Code>in-progress</Code> /{' '}
                            <Code>done</Code> / <Code>skipped</Code> / <Code>failed</Code> / <Code>stopped</Code>, a done count, and their address once ready. No ids, no
                            step columns, nothing that names a system.
                        </li>
                        <li>
                            The token at the end of the URL is a per-tenant secret; only its hash is stored, and it cannot be guessed from the tenant id. Anyone with the
                            link can read the page and do nothing else. <Code>GET /status/:token</Code> is the same data as JSON, rate limited to 60 a minute per IP.
                        </li>
                        <li>
                            The page polls every 5 seconds while setting up. A removed tenant’s page says so rather than disappearing.
                        </li>
                    </ul>
                    <CodeBlock code={STATUS_PAGE} title="The same data as JSON" lang="curl" />
                </DocSection>

                <DocSection id="errors" n="10" title="Errors">
                    <p>Errors are JSON with the HTTP status repeated in the body. The gateway passes the tenant service’s status and message through unchanged.</p>
                    <CodeBlock code={ERROR_BODY} title="Shape" lang="json" />
                    <div className="overflow-hidden rounded-md border border-rule bg-card">
                        <div className="hidden grid-cols-[80px_160px_1fr] gap-4 border-b border-rule bg-paper-deep/60 px-4 py-2 md:grid">
                            {['Status', 'Meaning', 'When'].map((h) => (
                                <span key={h} className="label">
                                    {h}
                                </span>
                            ))}
                        </div>
                        <ul className="divide-y divide-rule">
                            {ERRORS.map(([code, title, when]) => (
                                <li key={code} className="grid gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[80px_160px_1fr]">
                                    <span className="num font-mono text-[13px] font-medium text-ink">{code}</span>
                                    <span className="text-[14px] font-medium text-ink">{title}</span>
                                    <span className="text-[14px] text-ink-2">{when}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </DocSection>

                <DocSection id="limits" n="11" title="Rate limits and quotas">
                    <p>
                        Two kinds. <strong className="font-medium text-ink">Quotas</strong> are per company: 10 active tenants (provisioning or ready) and 50 new tenants per
                        rolling 24 hours on the free tier. Over either, <Code>POST /tenants</Code> answers 429 with a message naming the limit and a{' '}
                        <Code>Retry-After</Code> in seconds: until the oldest of the day’s provisions leaves the window, or an hour for the active-tenant limit, which only
                        frees up when you delete or cancel a tenant. Test tenants never count. Your current limits are in <Code>GET /organisation</Code> and on the
                        Settings page; ask support to raise them.
                    </p>
                    <p>
                        <strong className="font-medium text-ink">Rate limits</strong> are per client IP and per minute. Over the limit you get a 429 and nothing is queued;
                        wait for the window to pass.
                    </p>
                    <div className="overflow-hidden rounded-md border border-rule bg-card">
                        <ul className="divide-y divide-rule">
                            {LIMITS.map(([route, limit, scope]) => (
                                <li key={route} className="grid gap-x-4 px-4 py-2.5 sm:grid-cols-[260px_120px_1fr]">
                                    <span className="font-mono text-[13px] text-ink">{route}</span>
                                    <span className="num font-mono text-[13px] font-medium text-ink">{limit}</span>
                                    <span className="text-[13.5px] text-ink-3">{scope}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <p>
                        The dashboard polls from your browser and shares your IP’s 100 a minute with any scripts you run from the same machine. If you plan to create tenants in
                        bulk on the free tier, please ask first: everything runs on one small server.
                    </p>
                </DocSection>

                <DocSection id="reference" n="12" title="API reference">
                    <p>
                        The full reference is generated from the code and lives in Swagger on the gateway. Every route except <Code>/health</Code>, <Code>/auth/register</Code>,{' '}
                        <Code>/auth/login</Code>, <Code>/auth/refresh</Code> and <Code>/status/:token</Code> needs a bearer token; <Code>POST /tenants</Code>, <Code>GET /tenants/:id</Code> and the custom step callbacks also take a company API key.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <a href={SWAGGER_URL} target="_blank" rel="noreferrer" className={buttonClass('primary', 'md')}>
                            Open Swagger <ArrowUpRight size={14} />
                        </a>
                        <a href={`${REPO}#readme`} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'md')}>
                            README and architecture <ArrowUpRight size={14} />
                        </a>
                    </div>
                    <div className="overflow-hidden rounded-md border border-rule bg-card">
                        <ul className="divide-y divide-rule">
                            {ENDPOINTS.map(([method, path, what]) => (
                                <li key={method + path} className="grid gap-x-4 gap-y-0.5 px-4 py-2.5 sm:grid-cols-[88px_220px_1fr]">
                                    <span className="font-mono text-[12px] font-medium text-blueprint">{method}</span>
                                    <span className="break-all font-mono text-[13px] text-ink">{path}</span>
                                    <span className="text-[13.5px] text-ink-2">{what}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <p className="text-[13.5px] text-ink-3">
                        Questions go to the{' '}
                        <Link to="/support" className="link">
                            support page
                        </Link>{' '}
                        or GitHub issues.
                    </p>
                </DocSection>
            </DocShell>
        </SiteShell>
    );
}

function QuickStep({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
    return (
        <article className="rounded-md border border-rule bg-card p-5 shadow-sheet">
            <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-sm border-[1.5px] border-ink font-mark text-[11px]">{n}</span>
                <h3 className="font-cond text-[24px] font-semibold leading-tight text-ink">{title}</h3>
            </div>
            <div className="space-y-3 text-[14.5px] leading-relaxed text-ink-2">{children}</div>
        </article>
    );
}
