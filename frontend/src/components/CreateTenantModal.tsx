import { useState } from 'react';
import type { FormEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
import { createTenant } from '../lib/api';
import { apiMessage } from '../lib/errors';
import { PLANS, STAGES, schemaName } from '../lib/pipeline';
import { PLAN_BLURBS, SIMPLE_STEPS, tenantHost } from '../lib/simple';
import { inputClass } from '../lib/ui';
import { useIsSimple } from '../lib/mode';
import { cn } from '../lib/cn';
import type { Tenant } from '../lib/types';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { Field } from './ui/Field';

interface CreateTenantModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated: (tenant: Tenant) => void;
}

type PlanId = (typeof PLANS)[number]['id'];

export default function CreateTenantModal({ isOpen, onClose, onCreated }: CreateTenantModalProps) {
    const [name, setName] = useState('');
    const [subdomain, setSubdomain] = useState('');
    const [touched, setTouched] = useState(false);
    const [plan, setPlan] = useState<PlanId>('pro');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    // One key per form fill: resubmitting after a timeout replays the first result instead of creating twice.
    const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
    const simple = useIsSimple();

    const reset = () => {
        setName('');
        setSubdomain('');
        setTouched(false);
        setPlan('pro');
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
            const tenant = await createTenant({ name: name.trim(), subdomain, planId: plan }, idempotencyKey);
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
                    <Button variant="primary" type="submit" form="create-tenant" busy={loading} disabled={!name.trim() || subdomain.length < 2}>
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
                        hint={simple ? `Letters only, up to 30. Their address will be ${tenantHost(subdomain || 'globex')}.` : 'Letters only, up to 30.'}
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
                    <legend className="label mb-1.5 text-ink-2">Plan</legend>
                    <div className="grid gap-2 sm:grid-cols-3">
                        {PLANS.map((p) => {
                            const on = plan === p.id;
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
                                    <span className="block text-[15px] font-semibold">{p.name}</span>
                                    {simple ? (
                                        <span className={cn('block text-[12.5px]', on ? 'text-paper/75' : 'text-ink-3')}>{PLAN_BLURBS[p.id]}</span>
                                    ) : (
                                        <span className={cn('block font-mono text-[11px]', on ? 'text-paper/65' : 'text-ink-3')}>
                                            planId: {p.id}
                                        </span>
                                    )}
                                </label>
                            );
                        })}
                    </div>
                    <p className="mt-1.5 text-[13px] text-ink-3">
                        {simple ? 'Every plan starts with a 14-day free trial.' : 'Billing maps the plan to a Stripe price and starts a 14-day trial.'}
                    </p>
                </fieldset>

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
                                        {s.index === 0 ? `schema ${schemaName(subdomain || 'globex')}` : s.name.toLowerCase()}
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
