import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, LogOut, MailCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { getOrganisation, getSettings, saveSettings, updateOrganisation } from '../lib/api';
import { useResource } from '../lib/hooks';
import { useAuth } from '../lib/auth-context';
import { apiMessage } from '../lib/errors';
import { previewHost } from '../lib/simple';
import { inputClass } from '../lib/ui';
import { cn } from '../lib/cn';
import type { Organisation, PlanId, UserSettings } from '../lib/types';
import { PLAN_IDS } from '../lib/types';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import Button from '../components/ui/Button';
import { Field, Toggle } from '../components/ui/Field';
import LoadError from '../components/LoadError';

type NotifyKey = 'emailNotifications' | 'failedJobAlerts';

const NOTIFY: { key: NotifyKey; title: string; body: string }[] = [
    { key: 'emailNotifications', title: 'Email notifications', body: 'Account and tenant lifecycle emails.' },
    { key: 'failedJobAlerts', title: 'Failed provisioning alerts', body: 'Tell me when a tenant fails or gets swept.' },
];

export default function Settings() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const settings = useResource(getSettings);
    const [draft, setDraft] = useState<UserSettings | null>(null);
    const [saved, setSaved] = useState<UserSettings | null>(null);
    const [saving, setSaving] = useState(false);
    const [toggling, setToggling] = useState<NotifyKey | null>(null);

    const current = saved ?? settings.data;
    const form = draft ?? current;
    const dirty =
        !!draft && !!current && (draft.firstName !== current.firstName || draft.lastName !== current.lastName || draft.email !== current.email);

    const edit = (patch: Partial<UserSettings>) => {
        if (!form) return;
        setDraft({ ...form, ...patch });
    };

    const handleSave = async (e: FormEvent) => {
        e.preventDefault();
        if (!form || !current) return;
        const emailChanged = form.email !== current.email;
        setSaving(true);
        try {
            const next = await saveSettings({
                firstName: form.firstName,
                lastName: form.lastName,
                ...(emailChanged && { email: form.email }),
            });
            setSaved(next);
            setDraft(null);
            toast.success(emailChanged ? `Check ${form.email} for a confirmation link` : 'Profile saved');
        } catch (err) {
            toast.error(apiMessage(err, 'Could not save the profile.'));
        } finally {
            setSaving(false);
        }
    };

    const toggle = async (key: NotifyKey, value: boolean) => {
        setToggling(key);
        try {
            const next = await saveSettings({ [key]: value });
            setSaved((prev) => ({ ...(prev ?? settings.data ?? next), ...next }));
            toast.success(`${NOTIFY.find((n) => n.key === key)?.title} ${value ? 'on' : 'off'}`);
        } catch (err) {
            toast.error(apiMessage(err, 'Could not update notifications.'));
        } finally {
            setToggling(null);
        }
    };

    const signOut = async () => {
        await logout();
        toast.success('Signed out');
        navigate('/');
    };

    return (
        <div className="max-w-4xl">
            <PageHeader sheet="07" eyebrow="Settings" title="Settings" lede="Your profile, your company, what we email you about, and this session." />

            {settings.error !== null && !settings.data && (
                <LoadError error={settings.error} what="settings" onRetry={settings.refresh} busy={settings.refreshing} />
            )}

            <Panel fig="7.1" title="Profile" className="mb-6">
                {!form ? (
                    <div className="grid gap-4 md:grid-cols-2">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className={`h-[66px] animate-pulse rounded bg-paper-deep/60 ${i === 2 ? 'md:col-span-2' : ''}`} />
                        ))}
                    </div>
                ) : (
                    <form onSubmit={handleSave}>
                        <div className="grid gap-4 md:grid-cols-2">
                            <Field label="First name" htmlFor="firstName">
                                <input id="firstName" value={form.firstName ?? ''} onChange={(e) => edit({ firstName: e.target.value })} className={inputClass} maxLength={100} />
                            </Field>
                            <Field label="Last name" htmlFor="lastName">
                                <input id="lastName" value={form.lastName ?? ''} onChange={(e) => edit({ lastName: e.target.value })} className={inputClass} maxLength={100} />
                            </Field>
                            <Field label="Email" htmlFor="email" className="md:col-span-2">
                                <input id="email" type="email" value={form.email ?? ''} onChange={(e) => edit({ email: e.target.value })} className={inputClass} />
                            </Field>
                        </div>
                        {current?.pendingEmail && (
                            <div role="status" className="mt-4 flex items-start gap-2.5 rounded border border-hold/35 bg-hold/[0.06] px-3 py-2.5 text-[14px] text-ink-2">
                                <MailCheck size={16} className="mt-0.5 shrink-0 text-hold" />
                                <p className="min-w-0">
                                    Check <span className="break-all font-medium text-ink">{current.pendingEmail}</span> for a confirmation link. You
                                    still sign in as <span className="break-all font-medium text-ink">{current.email}</span> until you open it. The link
                                    expires in 24 hours.
                                </p>
                            </div>
                        )}
                        <div className="mt-5 flex items-center justify-end gap-3 border-t border-rule pt-4">
                            {dirty && <span className="font-mono text-[11.5px] text-hold">unsaved changes</span>}
                            {dirty && (
                                <Button variant="ghost" onClick={() => setDraft(null)}>
                                    Discard
                                </Button>
                            )}
                            <Button type="submit" variant="primary" busy={saving} disabled={!dirty}>
                                Save profile
                            </Button>
                        </div>
                    </form>
                )}
            </Panel>

            <CompanyPanel />

            <BillingPanel />

            <Panel fig="7.4" title="Notifications" flush className="mb-6">
                <ul className="divide-y divide-rule">
                    {NOTIFY.map((n) => (
                        <li key={n.key} className="flex items-center gap-4 px-4 py-4 sm:px-5">
                            <div className="min-w-0 flex-1">
                                <p className="text-[15px] font-semibold text-ink">{n.title}</p>
                                <p className="text-[14px] text-ink-3">{n.body}</p>
                            </div>
                            <Toggle
                                label={n.title}
                                checked={!!current?.[n.key]}
                                disabled={!current || toggling === n.key}
                                onChange={(v) => toggle(n.key, v)}
                            />
                        </li>
                    ))}
                </ul>
            </Panel>

            <Panel fig="7.5" title="Session" flush>
                <dl className="grid gap-px bg-rule sm:grid-cols-2">
                    {[
                        ['Signed in as', user?.email ?? '—'],
                        ['Role', user?.role ?? '—'],
                        ['Organisation ID', user?.organisationId ?? '—'],
                        ['User ID', user?.id ?? '—'],
                    ].map(([k, v]) => (
                        <div key={k} className="min-w-0 bg-card px-5 py-3">
                            <dt className="label mb-1">{k}</dt>
                            <dd className="truncate font-mono text-[13px] text-ink">{v}</dd>
                        </div>
                    ))}
                </dl>
                <div className="flex flex-wrap items-center gap-3 border-t border-rule px-5 py-4">
                    <p className="min-w-0 flex-1 text-[13.5px] text-ink-3">
                        Access tokens refresh automatically. Password changes aren't exposed by the API yet.
                    </p>
                    <Button onClick={signOut}>
                        <LogOut size={14} /> Sign out
                    </Button>
                </div>
            </Panel>
        </div>
    );
}

// The company's name and the domain its customers' addresses are shown under.
function CompanyPanel() {
    const organisation = useResource(getOrganisation);
    const [saved, setSaved] = useState<Organisation | null>(null);
    const [draft, setDraft] = useState<{ name: string; baseDomain: string } | null>(null);
    const [saving, setSaving] = useState(false);

    const current = saved ?? organisation.data;
    const form = draft ?? (current ? { name: current.name, baseDomain: current.baseDomain ?? '' } : null);
    const dirty = !!draft && !!current && (draft.name !== current.name || draft.baseDomain !== (current.baseDomain ?? ''));
    const domainOk = !form?.baseDomain || /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(form.baseDomain.trim());

    const edit = (patch: Partial<NonNullable<typeof form>>) => {
        if (!form) return;
        setDraft({ ...form, ...patch });
    };

    const handleSave = async (e: FormEvent) => {
        e.preventDefault();
        if (!form || !current) return;
        setSaving(true);
        try {
            const baseDomain = form.baseDomain.trim().toLowerCase();
            const next = await updateOrganisation({
                ...(form.name.trim() !== current.name && { name: form.name.trim() }),
                ...(baseDomain !== (current.baseDomain ?? '') && { baseDomain: baseDomain || null }),
            });
            setSaved(next);
            setDraft(null);
            toast.success('Company saved');
        } catch (err) {
            toast.error(apiMessage(err, 'Could not save the company.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Panel fig="7.2" title="Company" className="mb-6">
            {organisation.error !== null && !organisation.data && (
                <LoadError error={organisation.error} what="your company" onRetry={organisation.refresh} busy={organisation.refreshing} />
            )}
            {!form ? (
                <div className="grid gap-4 md:grid-cols-2">
                    {[0, 1].map((i) => (
                        <div key={i} className="h-[66px] animate-pulse rounded bg-paper-deep/60" />
                    ))}
                </div>
            ) : (
                <form onSubmit={handleSave}>
                    <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Company name" htmlFor="companyName">
                            <input id="companyName" value={form.name} onChange={(e) => edit({ name: e.target.value })} className={inputClass} maxLength={100} />
                        </Field>
                        <Field label="Handle" htmlFor="companyHandle" hint="Fixed at sign-up. Prefixes your tenants' database schemas.">
                            <input id="companyHandle" value={current?.handle ?? ''} readOnly className={cn(inputClass, 'font-mono text-[14px] opacity-70')} />
                        </Field>
                        <Field
                            label="Base domain"
                            htmlFor="baseDomain"
                            className="md:col-span-2"
                            aside="optional"
                            error={domainOk ? undefined : 'A domain like acme.app, no protocol or path.'}
                            hint={`Customer addresses are shown as ${previewHost('globex', form.baseDomain.trim() || null)}. Informational until DNS is real; it changes nothing on your domain.`}
                        >
                            <input
                                id="baseDomain"
                                value={form.baseDomain}
                                onChange={(e) => edit({ baseDomain: e.target.value })}
                                className={cn(inputClass, 'font-mono text-[14px]')}
                                placeholder="acme.app"
                                maxLength={253}
                                spellCheck={false}
                            />
                        </Field>
                    </div>
                    <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-rule pt-4">
                        {current && (
                            <p className="min-w-0 flex-1 text-[13px] text-ink-3">
                                Limits: {current.limits.maxActiveTenants} active customers and {current.limits.maxProvisionsPerDay} new customers a day. Test
                                customers don't count. Ask support to raise them.
                            </p>
                        )}
                        {dirty && <span className="font-mono text-[11.5px] text-hold">unsaved changes</span>}
                        {dirty && (
                            <Button variant="ghost" onClick={() => setDraft(null)}>
                                Discard
                            </Button>
                        )}
                        <Button type="submit" variant="primary" busy={saving} disabled={!dirty || !domainOk || !form.name.trim()}>
                            Save company
                        </Button>
                    </div>
                </form>
            )}
        </Panel>
    );
}

const PLAN_NAMES: Record<PlanId, string> = { starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise' };
const STRIPE_KEY_OK = /^(sk|rk)_(test|live)_[A-Za-z0-9]{8,}$/;
const PRICE_OK = /^price_[A-Za-z0-9]{8,}$/;

type PriceDraft = Record<PlanId, string>;

const pricesOf = (o: Organisation): PriceDraft => ({
    starter: o.stripePrices?.starter ?? '',
    pro: o.stripePrices?.pro ?? '',
    enterprise: o.stripePrices?.enterprise ?? '',
});

// The company's own Stripe account. Until it is connected every customer's billing step is skipped.
function BillingPanel() {
    const organisation = useResource(getOrganisation);
    const [saved, setSaved] = useState<Organisation | null>(null);
    const [key, setKey] = useState('');
    const [prices, setPrices] = useState<PriceDraft | null>(null);
    const [busy, setBusy] = useState<'connect' | 'prices' | 'disconnect' | null>(null);

    const current = saved ?? organisation.data;
    const connected = !!current?.stripeConfigured;
    const form = prices ?? (current ? pricesOf(current) : null);
    const pricesDirty = !!prices && !!current && PLAN_IDS.some((p) => prices[p].trim() !== (current.stripePrices?.[p] ?? ''));
    const pricesOk = !form || PLAN_IDS.every((p) => !form[p].trim() || PRICE_OK.test(form[p].trim()));
    const keyOk = STRIPE_KEY_OK.test(key.trim());
    const mapped = current ? PLAN_IDS.filter((p) => !!current.stripePrices?.[p]) : [];

    const pricePatch = () =>
        form
            ? (Object.fromEntries(PLAN_IDS.map((p) => [p, form[p].trim() || null])) as Record<PlanId, string | null>)
            : undefined;

    const connect = async (e: FormEvent) => {
        e.preventDefault();
        if (!keyOk) return;
        setBusy('connect');
        try {
            const next = await updateOrganisation({ stripeSecretKey: key.trim(), ...(pricesDirty && { stripePrices: pricePatch() }) });
            setSaved(next);
            setKey('');
            setPrices(null);
            toast.success('Stripe connected. New customers get a subscription from now on.');
        } catch (err) {
            toast.error(apiMessage(err, 'Could not connect Stripe.'));
        } finally {
            setBusy(null);
        }
    };

    const savePrices = async (e: FormEvent) => {
        e.preventDefault();
        if (!pricesOk) return;
        setBusy('prices');
        try {
            const next = await updateOrganisation({ stripePrices: pricePatch() });
            setSaved(next);
            setPrices(null);
            toast.success('Plan prices saved');
        } catch (err) {
            toast.error(apiMessage(err, 'Could not save the prices.'));
        } finally {
            setBusy(null);
        }
    };

    const disconnect = async () => {
        setBusy('disconnect');
        try {
            const next = await updateOrganisation({ stripeSecretKey: null });
            setSaved(next);
            toast.success('Stripe disconnected. Billing is skipped for new customers.');
        } catch (err) {
            toast.error(apiMessage(err, 'Could not disconnect Stripe.'));
        } finally {
            setBusy(null);
        }
    };

    const priceFields = form && (
        <div className="grid gap-4 md:grid-cols-3">
            {PLAN_IDS.map((p) => (
                <Field
                    key={p}
                    label={`${PLAN_NAMES[p]} price`}
                    htmlFor={`price-${p}`}
                    aside="optional"
                    error={!form[p].trim() || PRICE_OK.test(form[p].trim()) ? undefined : 'A Stripe Price ID, like price_1Q…'}
                >
                    <input
                        id={`price-${p}`}
                        value={form[p]}
                        onChange={(e) => setPrices({ ...form, [p]: e.target.value })}
                        className={cn(inputClass, 'font-mono text-[14px]')}
                        placeholder="price_…"
                        spellCheck={false}
                        autoComplete="off"
                    />
                </Field>
            ))}
        </div>
    );

    return (
        <Panel
            fig="7.3"
            title="Billing"
            meta={connected ? `Stripe connected · ${mapped.length} of ${PLAN_IDS.length} plans priced` : 'Stripe not connected'}
            className="mb-6"
        >
            {organisation.error !== null && !organisation.data && (
                <LoadError error={organisation.error} what="your billing setup" onRetry={organisation.refresh} busy={organisation.refreshing} />
            )}
            {!current || !form ? (
                <div className="h-[66px] animate-pulse rounded bg-paper-deep/60" />
            ) : connected ? (
                <form onSubmit={savePrices}>
                    <div className="mb-5 flex items-start gap-3 rounded border border-go/35 bg-go/[0.05] px-3 py-2.5 text-[14px] text-ink-2">
                        <CreditCard size={16} className="mt-0.5 shrink-0 text-go" />
                        <p className="min-w-0">
                            <span className="font-semibold text-ink">Connected to your Stripe account.</span> Every new customer gets a Stripe customer and a
                            14-day-trial subscription on the price mapped to their plan. The key is stored encrypted and is never shown again.
                            {mapped.length < PLAN_IDS.length && (
                                <>
                                    {' '}
                                    Plans without a price (<span className="font-medium text-ink">{PLAN_IDS.filter((p) => !mapped.includes(p)).map((p) => PLAN_NAMES[p]).join(', ')}</span>)
                                    fail at the billing step until you add one.
                                </>
                            )}
                        </p>
                    </div>
                    {priceFields}
                    <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-rule pt-4">
                        <Button variant="danger" onClick={disconnect} busy={busy === 'disconnect'} disabled={busy !== null && busy !== 'disconnect'}>
                            Disconnect Stripe
                        </Button>
                        <span className="min-w-0 flex-1 text-[13px] text-ink-3">Disconnecting skips billing for new customers. Existing subscriptions stay in Stripe.</span>
                        {pricesDirty && <span className="font-mono text-[11.5px] text-hold">unsaved changes</span>}
                        {pricesDirty && (
                            <Button variant="ghost" onClick={() => setPrices(null)}>
                                Discard
                            </Button>
                        )}
                        <Button type="submit" variant="primary" busy={busy === 'prices'} disabled={!pricesDirty || !pricesOk || busy !== null}>
                            Save prices
                        </Button>
                    </div>
                </form>
            ) : (
                <form onSubmit={connect}>
                    <div className="mb-5 flex items-start gap-3 rounded border border-hold/35 bg-hold/[0.06] px-3 py-2.5 text-[14px] text-ink-2">
                        <CreditCard size={16} className="mt-0.5 shrink-0 text-hold" />
                        <p className="min-w-0">
                            <span className="font-semibold text-ink">Billing: not connected.</span> Customers are set up without a subscription and their
                            billing step reads "Not connected". Nothing is simulated. Connect your Stripe account to start a 14-day trial for each new
                            customer.
                        </p>
                    </div>
                    <div className="grid gap-4">
                        <Field
                            label="Stripe secret key"
                            htmlFor="stripeKey"
                            hint="From Stripe → Developers → API keys. A restricted key (rk_…) with write access to Customers and Subscriptions is enough. Stored encrypted on our side; we never show it again."
                            error={!key || keyOk ? undefined : 'Starts with sk_test_, sk_live_, rk_test_ or rk_live_.'}
                        >
                            <input
                                id="stripeKey"
                                type="password"
                                value={key}
                                onChange={(e) => setKey(e.target.value)}
                                className={cn(inputClass, 'font-mono text-[14px]')}
                                placeholder="sk_test_…"
                                autoComplete="off"
                                spellCheck={false}
                            />
                        </Field>
                        {priceFields}
                    </div>
                    <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-rule pt-4">
                        <span className="min-w-0 flex-1 text-[13px] text-ink-3">
                            Prices are Stripe Price IDs for your own plans. A plan without one fails at the billing step, so map the plans you use.
                        </span>
                        <Button type="submit" variant="primary" busy={busy === 'connect'} disabled={!keyOk || !pricesOk || busy !== null}>
                            Connect Stripe
                        </Button>
                    </div>
                </form>
            )}
        </Panel>
    );
}
