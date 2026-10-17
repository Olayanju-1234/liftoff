import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/auth-context';
import { apiMessage } from '../lib/errors';
import { inputClass } from '../lib/ui';
import AuthShell, { StageLadder } from '../components/AuthShell';
import Button from '../components/ui/Button';
import { Field } from '../components/ui/Field';
import { cn } from '../lib/cn';

interface FormState {
    name: string;
    email: string;
    tenantName: string;
    subdomain: string;
    password: string;
    confirmPassword: string;
}

const EMPTY: FormState = { name: '', email: '', tenantName: '', subdomain: '', password: '', confirmPassword: '' };

function slugify(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 50);
}

export default function Register() {
    const navigate = useNavigate();
    const { register, isAuthenticated } = useAuth();
    const [form, setForm] = useState<FormState>(EMPTY);
    const [subdomainTouched, setSubdomainTouched] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (isAuthenticated && !loading) return <Navigate to="/" replace />;

    const set = (key: keyof FormState) => (e: ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setForm((prev) => {
            const next = { ...prev, [key]: value };
            if (key === 'tenantName' && !subdomainTouched) next.subdomain = slugify(value.replace(/\s+/g, ''));
            return next;
        });
    };

    const onSubdomain = (e: ChangeEvent<HTMLInputElement>) => {
        setSubdomainTouched(true);
        setForm((prev) => ({ ...prev, subdomain: slugify(e.target.value) }));
    };

    const problems = {
        subdomain: form.subdomain && form.subdomain.length < 3 ? 'At least 3 characters.' : '',
        password: form.password && form.password.length < 8 ? 'At least 8 characters.' : '',
        confirm: form.confirmPassword && form.confirmPassword !== form.password ? "Doesn't match the password." : '',
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        if (form.password !== form.confirmPassword) return setError('Passwords do not match.');
        if (form.password.length < 8) return setError('Password must be at least 8 characters.');
        if (form.subdomain.length < 3) return setError('Subdomain must be at least 3 characters.');
        setLoading(true);
        try {
            await register({
                email: form.email,
                password: form.password,
                name: form.name || undefined,
                tenantName: form.tenantName,
                subdomain: form.subdomain,
            });
            toast.success('Account created');
            navigate('/', { replace: true });
        } catch (err) {
            setError(apiMessage(err, 'Registration failed.'));
            setLoading(false);
        }
    };

    const preview: [string, string][] = [
        ['Company', form.tenantName || 'Your company'],
        ['Handle', form.subdomain || 'handle'],
        ['Admin', form.email || 'you@company.com'],
        ['Role', 'ADMIN'],
    ];

    return (
        <AuthShell
            sheet="A2"
            title="Create your company account"
            lede="The account your team uses to onboard customers. Your company gets a workspace of its own, and you become its admin."
            aside={
                <div className="flex flex-1 flex-col justify-center px-12 py-10 xl:px-16">
                    <p className="label mb-3">Fig. B — what sign-up writes</p>
                    <div className="mb-10 max-w-md rounded-md border border-ink/70 bg-paper/50">
                        {preview.map(([k, v]) => (
                            <div key={k} className="grid grid-cols-[100px_1fr] gap-3 border-b border-rule px-4 py-2.5 last:border-b-0">
                                <span className="label pt-px">{k}</span>
                                <span className="truncate font-mono text-[13px] text-ink">{v}</span>
                            </div>
                        ))}
                    </div>
                    <p className="label mb-2">Then, for every customer you add</p>
                    <StageLadder caption="tenant ACTIVE, usually in about four seconds" />
                </div>
            }
        >
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {error && (
                    <div role="alert" className="flex items-start gap-2.5 rounded border border-abort/35 bg-abort/[0.06] px-3 py-2.5 text-[14px] text-abort">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                        {error}
                    </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Your name" htmlFor="name" aside="optional">
                        <input id="name" autoComplete="name" value={form.name} onChange={set('name')} className={inputClass} placeholder="Ada Lovelace" />
                    </Field>
                    <Field label="Email" htmlFor="email">
                        <input
                            id="email"
                            type="email"
                            autoComplete="email"
                            value={form.email}
                            onChange={set('email')}
                            className={inputClass}
                            placeholder="ada@acme.com"
                            required
                        />
                    </Field>
                </div>
                <Field label="Company name" htmlFor="tenantName">
                    <input
                        id="tenantName"
                        autoComplete="organization"
                        value={form.tenantName}
                        onChange={set('tenantName')}
                        className={inputClass}
                        placeholder="Acme Inc."
                        maxLength={100}
                        required
                    />
                </Field>
                <Field label="Company handle" htmlFor="subdomain" error={problems.subdomain} hint="Lowercase letters, numbers and hyphens. Used for your own workspace address.">
                    <input
                        id="subdomain"
                        value={form.subdomain}
                        onChange={onSubdomain}
                        className={cn(inputClass, 'font-mono text-[14px]')}
                        placeholder="acme"
                        maxLength={50}
                        required
                    />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Password" htmlFor="password" error={problems.password}>
                        <input
                            id="password"
                            type="password"
                            autoComplete="new-password"
                            value={form.password}
                            onChange={set('password')}
                            className={inputClass}
                            placeholder="8+ characters"
                            required
                        />
                    </Field>
                    <Field label="Confirm" htmlFor="confirmPassword" error={problems.confirm}>
                        <input
                            id="confirmPassword"
                            type="password"
                            autoComplete="new-password"
                            value={form.confirmPassword}
                            onChange={set('confirmPassword')}
                            className={inputClass}
                            placeholder="Again"
                            required
                        />
                    </Field>
                </div>
                <Button
                    type="submit"
                    variant="primary"
                    busy={loading}
                    disabled={!form.email || !form.tenantName || !form.subdomain || !form.password}
                    className="mt-2 h-11 w-full text-[15px]"
                >
                    {loading ? 'Creating account' : 'Create account'}
                    {!loading && <ArrowRight size={16} />}
                </Button>
            </form>
            <p className="mt-5 border-t border-rule pt-4 text-[14px] text-ink-3">
                Already have one?{' '}
                <Link to="/login" className="link font-medium">
                    Sign in
                </Link>
            </p>
        </AuthShell>
    );
}
