import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { formatDistanceStrict } from 'date-fns';
import { Check, Copy, CreditCard, KeyRound, LogOut, MailCheck, Plus, Trash2, Waypoints, Webhook } from 'lucide-react';
import toast from 'react-hot-toast';
import { createApiKey, getApiKeys, getOrganisation, getSettings, revokeApiKey, saveSettings, updateOrganisation } from '../lib/api';
import { useNow, useResource } from '../lib/hooks';
import { useAuth } from '../lib/auth-context';
import { apiMessage } from '../lib/errors';
import { STEP_NAMES, previewHost } from '../lib/simple';
import { STAGES } from '../lib/pipeline';
import { fmtStamp } from '../lib/time';
import { inputClass } from '../lib/ui';
import { cn } from '../lib/cn';
import type { ApiKey, Organisation, StepMode, StepName, UserSettings } from '../lib/types';
import {
    CUSTOM_STEP_DEFAULT_TIMEOUT_MS,
    CUSTOM_STEP_MAX_TIMEOUT_MS,
    CUSTOM_STEP_MIN_TIMEOUT_MS,
    DEFAULT_PLANS,
    MAX_PLANS,
    PLAN_ID_OK,
    organisationPlans,
} from '../lib/types';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import Button from '../components/ui/Button';
import { Field, Segmented, Toggle } from '../components/ui/Field';
import LoadError from '../components/LoadError';
import ConfirmDialog from '../components/ConfirmDialog';

type NotifyKey = 'emailNotifications' | 'failedJobAlerts';

const NOTIFY: { key: NotifyKey; title: string; body: string }[] = [
    { key: 'emailNotifications', title: 'Email notifications', body: 'Account and tenant lifecycle emails.' },
    { key: 'failedJobAlerts', title: 'Failed provisioning alerts', body: 'Tell me when a tenant fails or gets swept.' },
];

// The company is loaded once here and shared by every panel that edits it.
interface OrgState {
    current: Organisation | undefined;
    error: unknown;
    refreshing: boolean;
    refresh: () => void;
    onSaved: (next: Organisation) => void;
}

// Panels link from the onboarding checklist as /settings#company etc.; the header is sticky.
const PANEL = 'mb-6 scroll-mt-16';

export default function Settings() {
    const navigate = useNavigate();
    const { hash } = useLocation();
    const { user, logout } = useAuth();
    const settings = useResource(getSettings);
    const [draft, setDraft] = useState<UserSettings | null>(null);
    const [saved, setSaved] = useState<UserSettings | null>(null);
    const [saving, setSaving] = useState(false);
    const [toggling, setToggling] = useState<NotifyKey | null>(null);

    const organisation = useResource(getOrganisation);
    const [savedOrg, setSavedOrg] = useState<Organisation | null>(null);
    const org: OrgState = {
        current: savedOrg ?? organisation.data,
        error: organisation.error,
        refreshing: organisation.refreshing,
        refresh: organisation.refresh,
        onSaved: setSavedOrg,
    };

    useEffect(() => {
        if (!hash) return;
        document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
    }, [hash]);

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
            <PageHeader
                sheet="07"
                eyebrow="Settings"
                title="Settings"
                lede="Your profile, your company, how your systems connect to Liftoff, what we email you about, and this session."
            />

            {settings.error !== null && !settings.data && (
                <LoadError error={settings.error} what="settings" onRetry={settings.refresh} busy={settings.refreshing} />
            )}

            <Panel id="profile" fig="7.1" title="Profile" className={PANEL}>
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

            <CompanyPanel org={org} />

            <BillingPanel org={org} />

            <ApiKeysPanel emailVerified={user?.emailVerified !== false} />

            <WebhookPanel org={org} />

            <ProvisioningPanel org={org} />

            <Panel id="notifications" fig="7.7" title="Notifications" flush className={PANEL}>
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

            <Panel id="session" fig="7.8" title="Session" flush className="scroll-mt-16">
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

function OrgLoadError({ org, what }: { org: OrgState; what: string }) {
    if (org.error === null || org.current) return null;
    return <LoadError error={org.error} what={what} onRetry={org.refresh} busy={org.refreshing} />;
}

// The company's name and the domain its customers' addresses are shown under.
function CompanyPanel({ org }: { org: OrgState }) {
    const current = org.current;
    const [draft, setDraft] = useState<{ name: string; baseDomain: string } | null>(null);
    const [saving, setSaving] = useState(false);

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
            org.onSaved(next);
            setDraft(null);
            toast.success('Company saved');
        } catch (err) {
            toast.error(apiMessage(err, 'Could not save the company.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Panel id="company" fig="7.2" title="Company" className={PANEL}>
            <OrgLoadError org={org} what="your company" />
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

const STRIPE_KEY_OK = /^(sk|rk)_(test|live)_[A-Za-z0-9]{8,}$/;
const PRICE_OK = /^price_[A-Za-z0-9]{8,}$/;

interface PlanRow {
    id: string;
    name: string;
    description: string;
    price: string;
    // Ids are fixed once saved: tenants already carry them.
    saved: boolean;
}

const rowsOf = (o: Organisation): PlanRow[] =>
    organisationPlans(o).map((p) => ({ id: p.id, name: p.name, description: p.description ?? '', price: o.stripePrices?.[p.id] ?? '', saved: true }));

const sameRows = (a: PlanRow[], b: PlanRow[]) =>
    a.length === b.length && a.every((r, i) => r.id === b[i].id && r.name === b[i].name && r.description === b[i].description && r.price === b[i].price);

// The company's own Stripe account, and the customer plans its tenants are on. Until Stripe is
// connected every customer's billing step is skipped and plans carry no price.
function BillingPanel({ org }: { org: OrgState }) {
    const current = org.current;
    const [key, setKey] = useState('');
    const [rows, setRows] = useState<PlanRow[] | null>(null);
    const [busy, setBusy] = useState<'connect' | 'plans' | 'disconnect' | null>(null);

    const connected = !!current?.stripeConfigured;
    const form = rows ?? (current ? rowsOf(current) : null);
    const dirty = !!rows && !!current && !sameRows(rows, rowsOf(current));
    const keyOk = STRIPE_KEY_OK.test(key.trim());
    const ids = form?.map((r) => r.id.trim().toLowerCase()) ?? [];
    const rowError = (r: PlanRow, i: number) =>
        !r.id.trim()
            ? 'Give the plan an id.'
            : !PLAN_ID_OK.test(r.id.trim().toLowerCase())
              ? 'Lowercase letters and digits, with single hyphens or underscores.'
              : ids.indexOf(r.id.trim().toLowerCase()) !== i
                ? 'Another plan has this id.'
                : !r.name.trim()
                  ? 'Give the plan a name.'
                  : r.price.trim() && !PRICE_OK.test(r.price.trim())
                    ? 'A Stripe Price ID, like price_1Q…'
                    : undefined;
    const plansOk = !!form && form.length > 0 && form.every((r, i) => !rowError(r, i));
    const currentPlans = organisationPlans(current);
    const priced = current ? currentPlans.filter((p) => !!current.stripePrices?.[p.id]).length : 0;
    const isDefaults = currentPlans.length === DEFAULT_PLANS.length && DEFAULT_PLANS.every((d, i) => currentPlans[i]?.id === d.id && currentPlans[i]?.name === d.name);

    const edit = (i: number, patch: Partial<PlanRow>) => {
        if (!form) return;
        setRows(form.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    };
    const addRow = () => form && form.length < MAX_PLANS && setRows([...form, { id: '', name: '', description: '', price: '', saved: false }]);
    const removeRow = (i: number) => form && form.length > 1 && setRows(form.filter((_, j) => j !== i));

    const connect = async (e: FormEvent) => {
        e.preventDefault();
        if (!keyOk) return;
        setBusy('connect');
        try {
            const next = await updateOrganisation({ stripeSecretKey: key.trim() });
            org.onSaved(next);
            setKey('');
            toast.success('Stripe connected. Set a price per customer plan below.');
        } catch (err) {
            toast.error(apiMessage(err, 'Could not connect Stripe.'));
        } finally {
            setBusy(null);
        }
    };

    const savePlans = async (e: FormEvent) => {
        e.preventDefault();
        if (!form || !current || !plansOk) return;
        setBusy('plans');
        try {
            const plans = form.map((r) => ({ id: r.id.trim().toLowerCase(), name: r.name.trim(), ...(r.description.trim() && { description: r.description.trim() }) }));
            // Every current plan gets its price or null; plans that were removed lose theirs.
            const stripePrices: Record<string, string | null> = {};
            for (const r of form) stripePrices[r.id.trim().toLowerCase()] = connected && r.price.trim() ? r.price.trim() : null;
            for (const p of currentPlans) if (!(p.id in stripePrices)) stripePrices[p.id] = null;
            const next = await updateOrganisation({ plans, stripePrices });
            org.onSaved(next);
            setRows(null);
            toast.success('Customer plans saved');
        } catch (err) {
            toast.error(apiMessage(err, 'Could not save the plans.'));
        } finally {
            setBusy(null);
        }
    };

    const resetDefaults = async () => {
        setBusy('plans');
        try {
            const next = await updateOrganisation({ plans: null });
            org.onSaved(next);
            setRows(null);
            toast.success('Back to the default plans');
        } catch (err) {
            toast.error(apiMessage(err, 'Could not reset the plans.'));
        } finally {
            setBusy(null);
        }
    };

    const disconnect = async () => {
        setBusy('disconnect');
        try {
            const next = await updateOrganisation({ stripeSecretKey: null });
            org.onSaved(next);
            toast.success('Stripe disconnected. Billing is skipped for new customers.');
        } catch (err) {
            toast.error(apiMessage(err, 'Could not disconnect Stripe.'));
        } finally {
            setBusy(null);
        }
    };

    return (
        <Panel
            id="billing"
            fig="7.3"
            title="Billing"
            meta={current ? (connected ? `Stripe connected · ${priced} of ${currentPlans.length} customer plans priced` : 'Stripe not connected') : undefined}
            className={PANEL}
        >
            <OrgLoadError org={org} what="your billing setup" />
            {!current || !form ? (
                <div className="h-[66px] animate-pulse rounded bg-paper-deep/60" />
            ) : (
                <>
                    {connected ? (
                        <div className="mb-5 flex flex-wrap items-start gap-3 rounded border border-go/35 bg-go/[0.05] px-3 py-2.5 text-[14px] text-ink-2">
                            <CreditCard size={16} className="mt-0.5 shrink-0 text-go" />
                            <p className="min-w-0 flex-1">
                                <span className="font-semibold text-ink">Connected to your Stripe account.</span> Every new customer gets a Stripe customer and a
                                14-day-trial subscription on the price of their customer plan. The key is stored encrypted and is never shown again.
                                {priced < currentPlans.length && (
                                    <>
                                        {' '}
                                        Plans without a price (
                                        <span className="font-medium text-ink">
                                            {currentPlans
                                                .filter((p) => !current.stripePrices?.[p.id])
                                                .map((p) => p.name)
                                                .join(', ')}
                                        </span>
                                        ) fail at the billing step until you add one.
                                    </>
                                )}
                            </p>
                            <Button size="sm" variant="danger" onClick={disconnect} busy={busy === 'disconnect'} disabled={busy !== null && busy !== 'disconnect'}>
                                Disconnect
                            </Button>
                        </div>
                    ) : (
                        <form onSubmit={connect} className="mb-5">
                            <div className="mb-4 flex items-start gap-3 rounded border border-hold/35 bg-hold/[0.06] px-3 py-2.5 text-[14px] text-ink-2">
                                <CreditCard size={16} className="mt-0.5 shrink-0 text-hold" />
                                <p className="min-w-0">
                                    <span className="font-semibold text-ink">Billing: not connected.</span> Customers are set up without a subscription and their
                                    billing step reads "Not connected". Nothing is simulated. Connect your Stripe account to start a 14-day trial for each new
                                    customer.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-end gap-3">
                                <Field
                                    label="Stripe secret key"
                                    htmlFor="stripeKey"
                                    className="min-w-0 flex-1 basis-72"
                                    hint="From Stripe → Developers → API keys. A restricted key (rk_…) with write access to Customers and Subscriptions is enough. Stored encrypted; never shown again."
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
                                <Button type="submit" variant="primary" busy={busy === 'connect'} disabled={!keyOk || busy !== null} className="mb-[46px]">
                                    Connect Stripe
                                </Button>
                            </div>
                        </form>
                    )}

                    <form onSubmit={savePlans} className="border-t border-rule pt-4">
                        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <h3 className="text-[15px] font-semibold text-ink">Customer plans</h3>
                            <p className="min-w-0 flex-1 text-[13px] text-ink-3">
                                The plans your customers are on, in your product's words. The id is what your signup flow sends as{' '}
                                <span className="font-mono text-ink-2">planId</span>.
                                {!connected && ' Connect Stripe to set a price per plan.'}
                            </p>
                        </div>
                        <ul className="space-y-2">
                            {form.map((r, i) => {
                                const error = rowError(r, i);
                                return (
                                    <li key={i} className="rounded border border-rule-strong bg-paper/40 p-3">
                                        <div className={cn('grid gap-3', connected ? 'md:grid-cols-[150px_minmax(0,1fr)_minmax(0,1.3fr)_190px_auto]' : 'md:grid-cols-[150px_minmax(0,1fr)_minmax(0,1.5fr)_auto]')}>
                                            <Field label="Id" htmlFor={`plan-id-${i}`}>
                                                <input
                                                    id={`plan-id-${i}`}
                                                    value={r.id}
                                                    onChange={(e) => edit(i, { id: e.target.value })}
                                                    readOnly={r.saved}
                                                    className={cn(inputClass, 'font-mono text-[14px]', r.saved && 'opacity-70')}
                                                    placeholder="growth"
                                                    maxLength={40}
                                                    spellCheck={false}
                                                    autoComplete="off"
                                                />
                                            </Field>
                                            <Field label="Name" htmlFor={`plan-name-${i}`}>
                                                <input id={`plan-name-${i}`} value={r.name} onChange={(e) => edit(i, { name: e.target.value })} className={inputClass} placeholder="Growth" maxLength={60} />
                                            </Field>
                                            <Field label="Description" htmlFor={`plan-desc-${i}`} aside="optional">
                                                <input
                                                    id={`plan-desc-${i}`}
                                                    value={r.description}
                                                    onChange={(e) => edit(i, { description: e.target.value })}
                                                    className={inputClass}
                                                    placeholder="For teams of 10 to 50"
                                                    maxLength={120}
                                                />
                                            </Field>
                                            {connected && (
                                                <Field label="Stripe price" htmlFor={`plan-price-${i}`} aside="optional">
                                                    <input
                                                        id={`plan-price-${i}`}
                                                        value={r.price}
                                                        onChange={(e) => edit(i, { price: e.target.value })}
                                                        className={cn(inputClass, 'font-mono text-[14px]')}
                                                        placeholder="price_…"
                                                        spellCheck={false}
                                                        autoComplete="off"
                                                    />
                                                </Field>
                                            )}
                                            <div className="flex items-end">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => removeRow(i)}
                                                    disabled={form.length === 1}
                                                    aria-label={`Remove ${r.name || 'this plan'}`}
                                                    title={form.length === 1 ? 'Keep at least one plan' : r.saved ? 'Customers already on it keep it; new ones cannot pick it' : 'Remove'}
                                                    className="mb-px h-10"
                                                >
                                                    <Trash2 size={14} />
                                                </Button>
                                            </div>
                                        </div>
                                        {error && <p className="mt-1.5 text-[13px] text-abort">{error}</p>}
                                    </li>
                                );
                            })}
                        </ul>
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <Button size="sm" onClick={addRow} disabled={form.length >= MAX_PLANS || busy !== null}>
                                <Plus size={13} /> Add plan
                            </Button>
                            {!isDefaults && (
                                <Button size="sm" variant="ghost" onClick={resetDefaults} disabled={busy !== null}>
                                    Back to defaults
                                </Button>
                            )}
                            <span className="min-w-0 flex-1 text-[13px] text-ink-3">
                                Removing a plan stops new customers picking it; customers already on it keep it.
                            </span>
                            {dirty && <span className="font-mono text-[11.5px] text-hold">unsaved changes</span>}
                            {dirty && (
                                <Button variant="ghost" onClick={() => setRows(null)}>
                                    Discard
                                </Button>
                            )}
                            <Button type="submit" variant="primary" busy={busy === 'plans'} disabled={!dirty || !plansOk || busy !== null}>
                                Save plans
                            </Button>
                        </div>
                    </form>
                </>
            )}
        </Panel>
    );
}

// A secret the API returns exactly once: shown with a Copy button until the person closes it.
function SecretOnce({ label, value, children, onClose }: { label: string; value: string; children: ReactNode; onClose: () => void }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    };
    return (
        <div role="status" className="mb-5 rounded border border-go/40 bg-go/[0.05] px-3 py-3">
            <p className="label mb-1.5 text-go">{label}</p>
            <div className="flex items-center gap-2 rounded border border-rule-strong bg-card pl-3 pr-1.5">
                <code className="min-w-0 flex-1 select-all break-all py-2 font-mono text-[13px] text-ink">{value}</code>
                <button
                    type="button"
                    onClick={copy}
                    className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm border border-rule-strong bg-card px-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-2 hover:text-ink"
                >
                    {copied ? <Check size={12} className="text-go" /> : <Copy size={12} />}
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-ink-2">
                <span className="min-w-0 flex-1">{children}</span>
                <Button size="sm" variant="ghost" onClick={onClose}>
                    I've stored it
                </Button>
            </div>
        </div>
    );
}

// Company API keys: created here, shown once, listed by prefix, revoked at once.
function ApiKeysPanel({ emailVerified }: { emailVerified: boolean }) {
    const now = useNow();
    const keys = useResource(getApiKeys);
    const [list, setList] = useState<ApiKey[] | null>(null);
    const [name, setName] = useState('');
    const [creating, setCreating] = useState(false);
    const [created, setCreated] = useState<{ name: string; key: string } | null>(null);
    const [revoking, setRevoking] = useState<ApiKey | null>(null);
    const [revokeBusy, setRevokeBusy] = useState(false);

    const current = list ?? keys.data;

    const create = async (e: FormEvent) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        setCreating(true);
        try {
            const made = await createApiKey(trimmed);
            const { key, ...summary } = made;
            setList([summary, ...(current ?? [])]);
            setCreated({ name: summary.name, key });
            setName('');
        } catch (err) {
            toast.error(apiMessage(err, 'Could not create the key.'));
        } finally {
            setCreating(false);
        }
    };

    const revoke = async () => {
        if (!revoking) return;
        setRevokeBusy(true);
        try {
            await revokeApiKey(revoking.id);
            setList((current ?? []).filter((k) => k.id !== revoking.id));
            toast.success(`${revoking.name} revoked`);
            setRevoking(null);
        } catch (err) {
            toast.error(apiMessage(err, 'Could not revoke the key.'));
        } finally {
            setRevokeBusy(false);
        }
    };

    return (
        <Panel
            id="api-keys"
            fig="7.4"
            title="API keys"
            meta={current ? `${current.length} key${current.length === 1 ? '' : 's'}` : undefined}
            className={PANEL}
        >
            <ConfirmDialog
                isOpen={revoking !== null}
                title={`Revoke ${revoking?.name ?? 'this key'}?`}
                message={
                    <>
                        Anything still sending <span className="font-mono text-ink">{revoking?.prefix}…</span> gets 401 from now on. This can't be undone; create a new key
                        instead if you only meant to rotate it.
                    </>
                }
                confirmLabel="Revoke key"
                onConfirm={revoke}
                onCancel={() => setRevoking(null)}
                loading={revokeBusy}
            />
            {keys.error !== null && !keys.data && <LoadError error={keys.error} what="your API keys" onRetry={keys.refresh} busy={keys.refreshing} />}

            {created && (
                <SecretOnce label={`${created.name}: copy this key now`} value={created.key} onClose={() => setCreated(null)}>
                    It won't be shown again. Put it in your signup service's secrets and send it as <code className="font-mono text-ink">Authorization: Bearer</code>.
                </SecretOnce>
            )}

            <form onSubmit={create} className="flex flex-wrap items-end gap-3">
                <Field
                    label="New key"
                    htmlFor="apiKeyName"
                    className="min-w-0 flex-1 basis-60"
                    hint={emailVerified ? 'Name it after what will use it, like "Signup service".' : 'Verify your email first: open the link we sent you, or resend it from the banner above.'}
                >
                    <input
                        id="apiKeyName"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={inputClass}
                        placeholder="Signup service"
                        maxLength={100}
                        disabled={!emailVerified}
                        autoComplete="off"
                    />
                </Field>
                <Button type="submit" variant="primary" busy={creating} disabled={!emailVerified || !name.trim()} className="mb-[26px]">
                    <Plus size={14} /> Create key
                </Button>
            </form>

            <div className="mt-5 border-t border-rule pt-4">
                {!current ? (
                    <div className="h-[48px] animate-pulse rounded bg-paper-deep/60" />
                ) : current.length === 0 ? (
                    <p className="text-[13.5px] text-ink-3">
                        No keys yet. Your signup flow needs one to add customers automatically; the{' '}
                        <Link to="/docs#quickstart" className="font-medium text-blueprint hover:underline">
                            quickstart
                        </Link>{' '}
                        shows the one request it makes.
                    </p>
                ) : (
                    <ul className="divide-y divide-rule">
                        {current.map((k) => (
                            <li key={k.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                                <KeyRound size={14} className="shrink-0 text-ink-3" />
                                <span className="min-w-0 flex-1 basis-40">
                                    <span className="block truncate text-[14.5px] font-medium text-ink">{k.name}</span>
                                    <span className="block font-mono text-[12px] text-ink-3">{k.prefix}…</span>
                                </span>
                                <span className="text-[12.5px] text-ink-3" title={k.lastUsedAt ? fmtStamp(Date.parse(k.lastUsedAt)) : undefined}>
                                    {k.lastUsedAt ? `Used ${formatDistanceStrict(Date.parse(k.lastUsedAt), now, { addSuffix: true })}` : 'Never used'}
                                </span>
                                <span className="text-[12.5px] text-ink-3" title={fmtStamp(Date.parse(k.createdAt))}>
                                    Created {formatDistanceStrict(Date.parse(k.createdAt), now, { addSuffix: true })}
                                </span>
                                <Button size="sm" variant="danger" onClick={() => setRevoking(k)} aria-label={`Revoke ${k.name}`}>
                                    <Trash2 size={13} /> Revoke
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </Panel>
    );
}

const WEBHOOK_URL_OK = (value: string) => {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
};

// Where the company's systems hear about customers. The signing secret is shown once per URL.
function WebhookPanel({ org }: { org: OrgState }) {
    const current = org.current;
    const [draft, setDraft] = useState<string | null>(null);
    const [busy, setBusy] = useState<'save' | 'rotate' | 'remove' | null>(null);
    const [secret, setSecret] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<'rotate' | 'remove' | null>(null);

    const url = draft ?? current?.webhookUrl ?? '';
    const configured = !!current?.webhookConfigured && !!current.webhookUrl;
    const dirty = draft !== null && draft.trim() !== (current?.webhookUrl ?? '');
    const urlOk = !url.trim() || WEBHOOK_URL_OK(url.trim());

    const apply = async (kind: NonNullable<typeof busy>, patch: Parameters<typeof updateOrganisation>[0], done: string) => {
        setBusy(kind);
        try {
            const next = await updateOrganisation(patch);
            const { webhookSecret, ...organisation } = next;
            org.onSaved(organisation);
            setDraft(null);
            setConfirm(null);
            if (webhookSecret) setSecret(webhookSecret);
            toast.success(done);
        } catch (err) {
            toast.error(apiMessage(err, 'Could not update the webhook.'));
        } finally {
            setBusy(null);
        }
    };

    const save = (e: FormEvent) => {
        e.preventDefault();
        const trimmed = url.trim();
        if (!trimmed || !urlOk) return;
        void apply('save', { webhookUrl: trimmed }, 'Webhook saved');
    };

    return (
        <Panel id="webhook" fig="7.5" title="Webhook" meta={configured ? 'Deliveries on' : 'Not set'} className={PANEL}>
            <ConfirmDialog
                isOpen={confirm !== null}
                variant={confirm === 'remove' ? 'danger' : 'warning'}
                title={confirm === 'remove' ? 'Turn webhook deliveries off?' : 'Issue a new signing secret?'}
                message={
                    confirm === 'remove'
                        ? "Your systems stop hearing when customers are ready, need attention or are removed. Add a URL again whenever you're ready; it gets a new secret."
                        : 'The current secret stops working the moment the new one is issued, so update your verifier straight after.'
                }
                confirmLabel={confirm === 'remove' ? 'Turn off' : 'New secret'}
                onConfirm={() =>
                    confirm === 'remove'
                        ? void apply('remove', { webhookUrl: null }, 'Webhook deliveries off')
                        : void apply('rotate', { rotateWebhookSecret: true }, 'New signing secret issued')
                }
                onCancel={() => setConfirm(null)}
                loading={busy !== null}
            />
            <OrgLoadError org={org} what="your webhook" />
            {!current ? (
                <div className="h-[66px] animate-pulse rounded bg-paper-deep/60" />
            ) : (
                <form onSubmit={save}>
                    {secret && (
                        <SecretOnce label="Signing secret: copy it now" value={secret} onClose={() => setSecret(null)}>
                            Every delivery carries <code className="font-mono text-ink">x-liftoff-signature: sha256=…</code>, the HMAC of the raw body with this secret. It isn't
                            shown again; issue a new one here if you lose it.
                        </SecretOnce>
                    )}
                    <div className="mb-4 flex items-start gap-3 rounded border border-rule bg-paper/60 px-3 py-2.5 text-[14px] text-ink-2">
                        <Webhook size={16} className="mt-0.5 shrink-0 text-ink-3" />
                        <p className="min-w-0">
                            We POST <code className="font-mono text-ink">tenant.active</code>, <code className="font-mono text-ink">tenant.failed</code> and{' '}
                            <code className="font-mono text-ink">tenant.deleted</code> here with the full customer record, retried four times over about half a minute. Your
                            customer's welcome is yours to send from it.{' '}
                            <Link to="/docs#webhooks" className="font-medium text-blueprint hover:underline">
                                Payload and signature
                            </Link>
                        </p>
                    </div>
                    <Field
                        label="Webhook URL"
                        htmlFor="webhookUrl"
                        error={urlOk ? undefined : 'A full URL starting with https:// (or http://).'}
                        hint="A public HTTPS endpoint on your side. Private or loopback addresses are refused."
                    >
                        <input
                            id="webhookUrl"
                            value={url}
                            onChange={(e) => setDraft(e.target.value)}
                            className={cn(inputClass, 'font-mono text-[14px]')}
                            placeholder="https://api.acme.com/liftoff/webhook"
                            maxLength={2000}
                            spellCheck={false}
                            autoComplete="off"
                        />
                    </Field>
                    <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-rule pt-4">
                        {configured && (
                            <>
                                <Button variant="danger" onClick={() => setConfirm('remove')} disabled={busy !== null}>
                                    Turn off
                                </Button>
                                <Button onClick={() => setConfirm('rotate')} disabled={busy !== null || dirty}>
                                    New secret
                                </Button>
                            </>
                        )}
                        <span className="min-w-0 flex-1" />
                        {dirty && <span className="font-mono text-[11.5px] text-hold">unsaved changes</span>}
                        {dirty && (
                            <Button variant="ghost" onClick={() => setDraft(null)}>
                                Discard
                            </Button>
                        )}
                        <Button type="submit" variant="primary" busy={busy === 'save'} disabled={!dirty || !url.trim() || !urlOk || busy !== null}>
                            {configured ? 'Save URL' : 'Add webhook'}
                        </Button>
                    </div>
                </form>
            )}
        </Panel>
    );
}

const MODE_OPTIONS: { value: StepMode; label: string }[] = [
    { value: 'builtin', label: 'Liftoff' },
    { value: 'skipped', label: 'Skip' },
    { value: 'custom', label: 'Your system' },
];

// What each step does when Liftoff runs it.
const BUILTIN_COPY: Record<StepName, string> = {
    database: 'Liftoff creates a separate database schema for the customer.',
    address: "Liftoff records the customer's address under your base domain.",
    credentials: 'Liftoff generates an API key for the customer and stores it securely.',
    billing: 'Liftoff starts a 14-day trial in your connected Stripe account, or skips billing until you connect one.',
    welcome: 'Liftoff emails your team that the customer is ready.',
};

const MAX_TIMEOUT_MINUTES = CUSTOM_STEP_MAX_TIMEOUT_MS / 60_000;
const MIN_TIMEOUT_MINUTES = CUSTOM_STEP_MIN_TIMEOUT_MS / 60_000;

interface StepRow {
    mode: StepMode;
    url: string;
    minutes: string;
}
type StepRows = Record<StepName, StepRow>;

const stepRowsOf = (o: Organisation): StepRows =>
    Object.fromEntries(
        STAGES.map(({ api }) => {
            const entry = o.stepConfig?.[api];
            const timeout = entry?.timeoutMs ?? CUSTOM_STEP_DEFAULT_TIMEOUT_MS;
            return [api, { mode: entry?.mode ?? 'builtin', url: entry?.url ?? '', minutes: String(Math.round(timeout / 60_000)) }];
        }),
    ) as StepRows;

const sameStepRows = (a: StepRows, b: StepRows) =>
    STAGES.every(({ api }) => a[api].mode === b[api].mode && a[api].url.trim() === b[api].url.trim() && a[api].minutes.trim() === b[api].minutes.trim());

const minutesOk = (value: string) => {
    const n = Number(value.trim());
    return Number.isInteger(n) && n >= MIN_TIMEOUT_MINUTES && n <= MAX_TIMEOUT_MINUTES;
};

// Who runs each of the five steps: Liftoff, nobody, or the company's own system.
function ProvisioningPanel({ org }: { org: OrgState }) {
    const current = org.current;
    const [rows, setRows] = useState<StepRows | null>(null);
    const [saving, setSaving] = useState(false);

    const form = rows ?? (current ? stepRowsOf(current) : null);
    const dirty = !!rows && !!current && !sameStepRows(rows, stepRowsOf(current));
    const supported = !!current?.stepConfig;
    const signed = !!current?.webhookConfigured;
    const customCount = form ? STAGES.filter(({ api }) => form[api].mode === 'custom').length : 0;
    const skippedCount = form ? STAGES.filter(({ api }) => form[api].mode === 'skipped').length : 0;
    const rowError = (r: StepRow) =>
        r.url.trim() && !WEBHOOK_URL_OK(r.url.trim())
            ? 'A full URL starting with https:// (or http://).'
            : r.mode === 'custom' && !r.url.trim()
              ? 'Your system needs a URL for this step.'
              : r.mode === 'custom' && !minutesOk(r.minutes)
                ? `Between ${MIN_TIMEOUT_MINUTES} and ${MAX_TIMEOUT_MINUTES} minutes.`
                : undefined;
    const valid = !!form && STAGES.every(({ api }) => !rowError(form[api]));
    const needsWebhook = customCount > 0 && !signed;

    const edit = (step: StepName, patch: Partial<StepRow>) => {
        if (!form) return;
        setRows({ ...form, [step]: { ...form[step], ...patch } });
    };

    const save = async (e: FormEvent) => {
        e.preventDefault();
        if (!form || !valid || needsWebhook) return;
        setSaving(true);
        try {
            const stepConfig = Object.fromEntries(
                STAGES.map(({ api }) => {
                    const r = form[api];
                    return [
                        api,
                        {
                            mode: r.mode,
                            ...(r.url.trim() && { url: r.url.trim() }),
                            ...(minutesOk(r.minutes) && { timeoutMs: Number(r.minutes.trim()) * 60_000 }),
                        },
                    ];
                }),
            );
            const next = await updateOrganisation({ stepConfig });
            org.onSaved(next);
            setRows(null);
            toast.success('Provisioning steps saved. New customers follow them from their next step.');
        } catch (err) {
            toast.error(apiMessage(err, 'Could not save the provisioning steps.'));
        } finally {
            setSaving(false);
        }
    };

    const meta = !form
        ? undefined
        : customCount + skippedCount === 0
          ? 'All five on Liftoff'
          : [customCount && `${customCount} on your system`, skippedCount && `${skippedCount} skipped`].filter(Boolean).join(' · ');

    return (
        <Panel id="provisioning" fig="7.6" title="Provisioning" meta={meta} className={PANEL}>
            <OrgLoadError org={org} what="your provisioning steps" />
            {!current || !form ? (
                <div className="h-[66px] animate-pulse rounded bg-paper-deep/60" />
            ) : !supported ? (
                <p className="text-[14px] text-ink-3">Step settings aren't available on this server yet.</p>
            ) : (
                <form onSubmit={save}>
                    <div className="mb-4 flex items-start gap-3 rounded border border-rule bg-paper/60 px-3 py-2.5 text-[14px] text-ink-2">
                        <Waypoints size={16} className="mt-0.5 shrink-0 text-ink-3" />
                        <p className="min-w-0">
                            Choose who does each step for a new customer. <span className="font-medium text-ink">Liftoff</span> does it for you.{' '}
                            <span className="font-medium text-ink">Skip</span> leaves it out. <span className="font-medium text-ink">Your system</span>: we send
                            the request to your URL, signed like a webhook, and wait for your system to tell us it's done. When a customer is removed, your
                            system gets a request to undo it too.{' '}
                            <Link to="/docs#custom-steps" className="font-medium text-blueprint hover:underline">
                                Request and callback
                            </Link>
                        </p>
                    </div>
                    {needsWebhook && (
                        <div role="alert" className="mb-4 flex items-start gap-3 rounded border border-hold/45 bg-hold/[0.06] px-3 py-2.5 text-[14px] text-ink-2">
                            <Webhook size={16} className="mt-0.5 shrink-0 text-hold" />
                            <p className="min-w-0">
                                Requests to your system are signed with your webhook secret.{' '}
                                <a href="#webhook" className="font-medium text-blueprint hover:underline">
                                    Add a webhook
                                </a>{' '}
                                first, then save these steps.
                            </p>
                        </div>
                    )}
                    <ol className="divide-y divide-rule rounded border border-rule-strong">
                        {STAGES.map((stage, i) => {
                            const r = form[stage.api];
                            const error = rowError(r);
                            return (
                                <li key={stage.api} className="px-3 py-3 sm:px-4">
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                        <span className="num w-5 shrink-0 font-mono text-[12px] text-ink-3">{i + 1}</span>
                                        <span className="min-w-0 flex-1 basis-48">
                                            <span className="block text-[15px] font-medium text-ink">{STEP_NAMES[stage.key]}</span>
                                            <span className="block font-mono text-[11.5px] text-ink-4">{stage.api}</span>
                                        </span>
                                        <Segmented<StepMode>
                                            label={`Who does ${STEP_NAMES[stage.key].toLowerCase()}`}
                                            value={r.mode}
                                            onChange={(mode) => edit(stage.api, { mode })}
                                            options={MODE_OPTIONS}
                                        />
                                    </div>
                                    <p className="mt-1.5 pl-9 text-[13px] text-ink-3">
                                        {r.mode === 'builtin'
                                            ? BUILTIN_COPY[stage.api]
                                            : r.mode === 'skipped'
                                              ? 'Nobody does this step. It shows as skipped and the next step starts straight away.'
                                              : `We send step.requested to your URL and wait up to ${minutesOk(r.minutes) ? `${r.minutes.trim()} minute${r.minutes.trim() === '1' ? '' : 's'}` : 'the time below'} for your system to call back. No answer by then and the step fails; you can retry it.`}
                                    </p>
                                    {r.mode === 'custom' && (
                                        <div className="mt-3 grid gap-3 pl-9 md:grid-cols-[minmax(0,1fr)_150px]">
                                            <Field label="Your URL" htmlFor={`step-url-${stage.api}`}>
                                                <input
                                                    id={`step-url-${stage.api}`}
                                                    value={r.url}
                                                    onChange={(e) => edit(stage.api, { url: e.target.value })}
                                                    className={cn(inputClass, 'font-mono text-[14px]')}
                                                    placeholder={`https://api.acme.com/liftoff/${stage.api}`}
                                                    maxLength={2000}
                                                    spellCheck={false}
                                                    autoComplete="off"
                                                />
                                            </Field>
                                            <Field label="Wait up to" htmlFor={`step-timeout-${stage.api}`} aside="minutes">
                                                <input
                                                    id={`step-timeout-${stage.api}`}
                                                    value={r.minutes}
                                                    onChange={(e) => edit(stage.api, { minutes: e.target.value })}
                                                    className={cn(inputClass, 'num font-mono text-[14px]')}
                                                    inputMode="numeric"
                                                    autoComplete="off"
                                                />
                                            </Field>
                                        </div>
                                    )}
                                    {error && <p className="mt-1.5 pl-9 text-[13px] text-abort">{error}</p>}
                                </li>
                            );
                        })}
                    </ol>
                    <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-rule pt-4">
                        <span className="min-w-0 flex-1 text-[13px] text-ink-3">
                            Customers already being set up follow the new settings from their next step. A private or loopback URL is refused.
                        </span>
                        {dirty && <span className="font-mono text-[11.5px] text-hold">unsaved changes</span>}
                        {dirty && (
                            <Button variant="ghost" onClick={() => setRows(null)}>
                                Discard
                            </Button>
                        )}
                        <Button type="submit" variant="primary" busy={saving} disabled={!dirty || !valid || needsWebhook}>
                            Save steps
                        </Button>
                    </div>
                </form>
            )}
        </Panel>
    );
}
