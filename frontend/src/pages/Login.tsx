import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/auth-context';
import { apiMessage } from '../lib/errors';
import { inputClass } from '../lib/ui';
import AuthShell, { StageLadder } from '../components/AuthShell';
import Button from '../components/ui/Button';
import { Field } from '../components/ui/Field';

export default function Login() {
    const navigate = useNavigate();
    const location = useLocation();
    const { login, isAuthenticated } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/';

    if (isAuthenticated && !loading) return <Navigate to={from} replace />;

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(email, password);
            toast.success('Signed in');
            navigate(from, { replace: true });
        } catch (err) {
            setError(apiMessage(err, 'Those credentials did not match.'));
            setLoading(false);
        }
    };

    return (
        <AuthShell
            sheet="A1"
            title="Sign in"
            lede="Back to the board. Your tenants, their sequences and anything parked in the dead-letter exchange."
            aside={
                <div className="flex flex-1 flex-col justify-center px-12 py-10 xl:px-16">
                    <p className="label mb-2">Fig. A — the sequence you'll be watching</p>
                    <p className="mb-8 max-w-sm text-[15px] text-ink-2">
                        Five workers, one exchange. Each lights up while it holds the tenant's message.
                    </p>
                    <StageLadder />
                </div>
            }
        >
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                {error && (
                    <div role="alert" className="flex items-start gap-2.5 rounded border border-abort/35 bg-abort/[0.06] px-3 py-2.5 text-[14px] text-abort">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                        {error}
                    </div>
                )}
                <Field label="Email" htmlFor="email">
                    <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={inputClass}
                        placeholder="you@company.com"
                        required
                    />
                </Field>
                <Field label="Password" htmlFor="password">
                    <input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={inputClass}
                        placeholder="••••••••"
                        required
                    />
                </Field>
                <Button type="submit" variant="primary" busy={loading} disabled={!email || !password} className="h-11 w-full text-[15px]">
                    {loading ? 'Signing in' : 'Sign in'}
                    {!loading && <ArrowRight size={16} />}
                </Button>
            </form>
            <p className="mt-5 border-t border-rule pt-4 text-[14px] text-ink-3">
                No workspace yet?{' '}
                <Link to="/register" className="link font-medium">
                    Create one
                </Link>
            </p>
        </AuthShell>
    );
}
