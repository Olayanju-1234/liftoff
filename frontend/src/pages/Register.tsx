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
}

const EMPTY: FormState = { name: '', email: '', tenantName: '', subdomain: '', password: '' };

// The server's HANDLE_PATTERN: letters and digits, single hyphens between.
const HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// What someone typing in the handle box may enter; the pattern is checked on submit.
function slugify(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 50);
}

// "Acme Inc." becomes "acme-inc".
function handleFrom(companyName: string) {
    return companyName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 50)
        .replace(/^-+|-+$/g, '');
}

function handleProblem(handle: string) {
    if (handle.length < 3) return 'At least 3 characters.';
    if (!HANDLE_PATTERN.test(handle)) return 'Letters and numbers, with single hyphens between them.';
    return '';
}

export default function Register() {
    const navigate = useNavigate();
    const { register, isAuthenticated } = useAuth();
    const [form, setForm] = useState<FormState>(EMPTY);
    const [subdomainTouched, setSubdomainTouched] = useState(false);
    // The handle is derived from the company name; its box only opens to change it or fix it.
    const [editingHandle, setEditingHandle] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (isAuthenticated && !loading) return <Navigate to="/" replace />;

    const set = (key: keyof FormState) => (e: ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setForm((prev) => {
            const next = { ...prev, [key]: value };
            if (key === 'tenantName' && !subdomainTouched) next.subdomain = handleFrom(value);
            return next;
        });
    };

    const onSubdomain = (e: ChangeEvent<HTMLInputElement>) => {
        setSubdomainTouched(true);
        setForm((prev) => ({ ...prev, subdomain: slugify(e.target.value) }));
    };

    const problems = {
        subdomain: form.subdomain && editingHandle ? handleProblem(form.subdomain) : '',
        password: form.password && form.password.length < 8 ? 'At least 8 characters.' : '',
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        if (form.password.length < 8) return setError('Password must be at least 8 characters.');
        const handleIssue = handleProblem(form.subdomain);
        if (handleIssue) {
            setEditingHandle(true);
            return setError(`Your company handle needs a change. ${handleIssue}`);
        }
        setLoading(true);
        try {
            await register({
                email: form.email,
                password: form.password,
                name: form.name || undefined,
                tenantName: form.tenantName,
                subdomain: form.subdomain,
            });
            toast.success(`Account created. Check ${form.email} for a verification link.`, { duration: 6000 });
            navigate('/', { replace: true });
        } catch (err) {
            const message = apiMessage(err, 'Registration failed.');
            if (/handle/i.test(message)) setEditingHandle(true);
            setError(message === 'Handle already taken' ? 'Another company already has that handle. Pick a different one below.' : message);
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
                <Field
                    label="Company name"
                    htmlFor="tenantName"
                    hint={
                        !editingHandle &&
                        form.subdomain && (
                            <>
                                Your handle: <span className="font-mono text-ink-2">{form.subdomain}</span> ·{' '}
                                <button type="button" onClick={() => setEditingHandle(true)} className="link">
                                    Change
                                </button>
                            </>
                        )
                    }
                >
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
                {editingHandle && (
                    <Field label="Company handle" htmlFor="subdomain" error={problems.subdomain} hint="Lowercase letters, numbers and hyphens. Unique to your company.">
                        <input
                            id="subdomain"
                            value={form.subdomain}
                            onChange={onSubdomain}
                            className={cn(inputClass, 'font-mono text-[14px]')}
                            placeholder="acme"
                            maxLength={50}
                            required
                            autoFocus
                        />
                    </Field>
                )}
                <Field
                    label="Password"
                    htmlFor="password"
                    error={problems.password}
                    aside={
                        <button
                            type="button"
                            onClick={() => setShowPassword((shown) => !shown)}
                            aria-controls="password"
                            aria-pressed={showPassword}
                            className="hover:text-ink"
                        >
                            {showPassword ? 'Hide' : 'Show'}
                        </button>
                    }
                >
                    <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={form.password}
                        onChange={set('password')}
                        className={inputClass}
                        placeholder="8+ characters"
                        required
                    />
                </Field>
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
                <p className="text-[12.5px] text-ink-3">
                    By creating an account you agree to the{' '}
                    <Link to="/terms" className="link">
                        terms of service
                    </Link>{' '}
                    and{' '}
                    <Link to="/privacy" className="link">
                        privacy policy
                    </Link>
                    .
                </p>
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
