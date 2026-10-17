import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { resetPassword } from '../lib/api';
import { apiMessage } from '../lib/errors';
import { sessionStore } from '../lib/session';
import { buttonClass, inputClass } from '../lib/ui';
import { cn } from '../lib/cn';
import AuthShell, { StageLadder } from '../components/AuthShell';
import Button from '../components/ui/Button';
import { Field } from '../components/ui/Field';

export default function ResetPassword() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const token = params.get('token');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const problems = {
        password: password && password.length < 8 ? 'At least 8 characters.' : '',
        confirm: confirm && confirm !== password ? "Doesn't match the password." : '',
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!token) return;
        setError('');
        if (password.length < 8) return setError('Password must be at least 8 characters.');
        if (password !== confirm) return setError('Passwords do not match.');
        setLoading(true);
        try {
            await resetPassword(token, password);
            // The reset signs every session out, this browser's included.
            sessionStore.set(null);
            toast.success('Password updated. Sign in with the new one.');
            navigate('/login', { replace: true });
        } catch (err) {
            setError(apiMessage(err, 'Could not reset the password.'));
            setLoading(false);
        }
    };

    return (
        <AuthShell
            sheet="A6"
            title="New password"
            lede="Choose a new password for your account. Every signed-in session is signed out once it's set."
            aside={
                <div className="flex flex-1 flex-col justify-center px-12 py-10 xl:px-16">
                    <p className="label mb-2">Fig. F — the board you're returning to</p>
                    <StageLadder />
                </div>
            }
        >
            {!token ? (
                <>
                    <div role="alert" className="flex items-start gap-2.5 rounded border border-abort/35 bg-abort/[0.06] px-3 py-2.5 text-[14px] text-abort">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                        This link is missing its token. Open the link from the email again, or ask for a new one.
                    </div>
                    <Link to="/forgot-password" className={cn(buttonClass('primary', 'md'), 'mt-5 h-11 w-full text-[15px]')}>
                        Request a new link <ArrowRight size={16} />
                    </Link>
                </>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                    {error && (
                        <div role="alert" className="flex items-start gap-2.5 rounded border border-abort/35 bg-abort/[0.06] px-3 py-2.5 text-[14px] text-abort">
                            <span className="flex items-start gap-2.5">
                                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                                <span>
                                    {error}{' '}
                                    {/expired|invalid/i.test(error) && (
                                        <Link to="/forgot-password" className="link">
                                            Request a new link.
                                        </Link>
                                    )}
                                </span>
                            </span>
                        </div>
                    )}
                    <Field label="New password" htmlFor="password" error={problems.password}>
                        <input
                            id="password"
                            type="password"
                            autoComplete="new-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={inputClass}
                            placeholder="8+ characters"
                            required
                        />
                    </Field>
                    <Field label="Confirm" htmlFor="confirm" error={problems.confirm}>
                        <input
                            id="confirm"
                            type="password"
                            autoComplete="new-password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            className={inputClass}
                            placeholder="Again"
                            required
                        />
                    </Field>
                    <Button type="submit" variant="primary" busy={loading} disabled={!password || !confirm} className="h-11 w-full text-[15px]">
                        {loading ? 'Saving' : 'Set new password'}
                        {!loading && <ArrowRight size={16} />}
                    </Button>
                </form>
            )}
        </AuthShell>
    );
}
