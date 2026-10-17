import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
import { createTenant, getOrganisation } from '../lib/api';
import { apiMessage } from '../lib/errors';
import { useResource } from '../lib/hooks';
import { STAGES } from '../lib/pipeline';
import { SIMPLE_STEPS, previewHost } from '../lib/simple';
import { inputClass } from '../lib/ui';
import { useIsSimple } from '../lib/mode';
import { cn } from '../lib/cn';
import { organisationPlans } from '../lib/types';
import type { Tenant } from '../lib/types';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { Field } from './ui/Field';

interface CreateTenantModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated: (tenant: Tenant) => void;
    // Opens with the test-mode box ticked (the onboarding checklist's "Add a test customer").
    initialTest?: boolean;
}

export default function CreateTenantModal({ isOpen, onClose, onCreated, initialTest = false }: CreateTenantModalProps) {
    const [name, setName] = useState('');
    const [subdomain, setSubdomain] = useState('');
    const [touched, setTouched] = useState(false);
    // '' until the person picks one: the first of the company's plans is the default.
    const [plan, setPlan] = useState('');
    const [test, setTest] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    // One key per form fill: resubmitting after a timeout replays the first result instead of creating twice.
    const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
    const simple = useIsSimple();
    // For the address preview only; the API computes the real address.
    const organisation = useResource(getOrganisation);
    const host = (sub: string) => previewHost(sub || 'globex', organisation.data?.baseDomain);
    // The company's own customer plans; the defaults stand in until they load.
    const plans = organisationPlans(organisation.data);
    const selected = plans.some((p) => p.id === plan) ? plan : (plans[0]?.id ?? '');

    useEffect(() => {
        if (isOpen && initialTest) setTest(true);
    }, [isOpen, initialTest]);

    const reset = () => {
        setName('');
        setSubdomain('');
        setTouched(false);
        setPlan('');
        setTest(false);
        setError('');
        setIdempotencyKey(crypto.randomUUID());
    };

    const close = () => {
        if (loading) return;
        reset();
        onClose();
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const tenant = await createTenant({ name: name.trim(), subdomain, planId: selected, ...(test && { test: true }) }, idempotencyKey);
            reset();
            onCreated(tenant);
        } catch (err) {
            setError(apiMessage(err, 'Could not create the tenant.'));
        } finally {
            setLoading(false);
        }
    };

    // The API validates subdomains with IsAlpha, so only letters get through.
    const toSub = (v: string) => v.toLowerCase().replace(/[^a-z]/g, '').slice(0, 30);

    return (
        <Modal
            open={isOpen}
            onClose={close}
            fig="New"
            title={simple ? 'Add a customer' : 'Provision a tenant'}
            size="lg"
            footer={
                <>
                    <Button variant="ghost" onClick={close} disabled={loading}>
                        Cancel
                    </Button>
                    <Button variant="primary" type="submit" form="create-tenant" busy={loading} disabled={!name.trim() || subdomain.length < 2 || !selected}>
                        {simple ? 'Add customer' : 'Start provisioning'}
                    </Button>
                </>
            }
        >
            <form id="create-tenant" onSubmit={handleSubmit} className="space-y-5">
                {error && (
                    <div role="alert" className="flex items-start gap-2.5 rounded border border-abort/35 bg-abort/[0.06] px-3 py-2.5 text-[14px] text-abort">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                        {error}
                    </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={simple ? 'Customer name' : 'Tenant name'} htmlFor="tenant-name">
                        <input
                            id="tenant-name"
                            value={name}
                            onChange={(e) => {
                                setName(e.target.value);
                                if (!touched) setSubdomain(toSub(e.target.value));
                            }}
                            className={inputClass}
                            placeholder="Globex Corporation"
                            maxLength={100}
                            required
                        />
                    </Field>
                    <Field
                        label={simple ? 'Address' : 'Subdomain'}
                        htmlFor="tenant-subdomain"
                        hint={simple ? `Letters only, up to 30. Their address will be ${host(subdomain)}.` : `Letters only, up to 30, unique within your company. Address: ${host(subdomain)}.`}
                    >
                        <input
                            id="tenant-subdomain"
                            value={subdomain}
                            onChange={(e) => {
                                setTouched(true);
                                setSubdomain(toSub(e.target.value));
                            }}
                            className={cn(inputClass, 'font-mono text-[14px]')}
                            placeholder="globex"
                            required
                        />
                    </Field>
                </div>

                <fieldset>
                    <legend className="label mb-1.5 text-ink-2">Customer plan</legend>
                    <div className={cn('grid gap-2', plans.length === 1 ? '' : plans.length === 2 || plans.length === 4 ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
                        {plans.map((p) => {
                            const on = selected === p.id;
                            return (
                                <label
                                    key={p.id}
                                    className={cn(
                                        'relative cursor-pointer rounded border px-3 py-2.5 transition-colors',
                                        on ? 'border-ink bg-ink text-paper' : 'border-rule-strong bg-card hover:border-ink-3',
                                    )}
                                >
                                    <input
                                        type="radio"
                                        name="plan"
                                        value={p.id}
                                        checked={on}
                                        onChange={() => setPlan(p.id)}
                                        className="sr-only"
                                    />
                                    <span className="block truncate text-[15px] font-semibold">{p.name}</span>
                                    {simple ? (
                                        <span className={cn('block truncate text-[12.5px]', on ? 'text-paper/75' : 'text-ink-3')}>{p.description ?? '\u00a0'}</span>
                                    ) : (
                                        <span className={cn('block truncate font-mono text-[11px]', on ? 'text-paper/65' : 'text-ink-3')}>
                                            planId: {p.id}
                                        </span>
                                    )}
                                </label>
                            );
                        })}
                    </div>
                    <p className="mt-1.5 text-[13px] text-ink-3">
                        {simple
                            ? 'Their plan on your product. Name your plans and set prices under Settings → Billing.'
                            : 'Billing subscribes them to the Stripe price you set for this plan under Settings → Billing, with a 14-day trial.'}
                    </p>
                </fieldset>

                <label className="flex cursor-pointer items-start gap-3 rounded border border-rule-strong bg-card px-3 py-2.5 hover:border-ink-3">
                    <input type="checkbox" checked={test} onChange={(e) => setTest(e.target.checked)} className="mt-1 h-4 w-4 accent-ink" />
                    <span className="min-w-0">
                        <span className="block text-[14.5px] font-medium text-ink">{simple ? 'Test customer' : 'Test mode'}</span>
                        <span className="block text-[13px] text-ink-3">
                            {simple
                                ? "Set up exactly like a real customer, but never billed and not counted towards your limits. Remove it whenever you're done."
                                : 'Provisions normally; the billing step is recorded as SKIPPED and no Stripe calls are made. Excluded from the quotas.'}
                        </span>
                    </span>
                </label>

                <div className="rounded border border-dashed border-rule-strong bg-paper/60 px-4 py-3">
                    <p className="label mb-2">What happens next</p>
                    {simple ? (
                        <ol className="grid gap-x-6 gap-y-1.5 text-[13.5px] text-ink-2 sm:grid-cols-2">
                            {SIMPLE_STEPS.map(({ stage, name }, i) => (
                                <li key={stage.key} className="flex gap-2.5">
                                    <span className="num w-4 font-mono text-[12px] text-ink-3">{i + 1}</span>
                                    <span>{name}</span>
                                </li>
                            ))}
                            <li className="flex gap-2.5 font-medium text-go">
                                <span className="w-4 font-mono text-[12px]">✓</span>
                                <span>The customer is ready</span>
                            </li>
                        </ol>
                    ) : (
                        <ol className="grid gap-x-6 gap-y-1 font-mono text-[12px] text-ink-2 sm:grid-cols-2">
                            {STAGES.map((s) => (
                                <li key={s.key} className="flex gap-2">
                                    <span className="w-6 text-ink-3">{s.code}</span>
                                    <span className="truncate">
                                        {s.index === 0 ? `schema tenant_${organisation.data?.handle.replace(/[^a-z0-9]/gi, '_') ?? 'org'}_${subdomain || 'globex'}` : s.name.toLowerCase()}
                                    </span>
                                </li>
                            ))}
                            <li className="flex gap-2 text-go">
                                <span className="w-6">GO</span>
                                <span>tenant ACTIVE</span>
                            </li>
                        </ol>
                    )}
                </div>
            </form>
        </Modal>
    );
}
