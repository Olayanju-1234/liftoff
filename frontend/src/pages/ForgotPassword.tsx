import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, MailCheck } from 'lucide-react';
import { forgotPassword } from '../lib/api';
import { apiMessage } from '../lib/errors';
import { inputClass } from '../lib/ui';
import AuthShell, { StageLadder } from '../components/AuthShell';
import Button from '../components/ui/Button';
import { Field } from '../components/ui/Field';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [sentTo, setSentTo] = useState<string | null>(null);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await forgotPassword(email.trim());
            setSentTo(email.trim());
        } catch (err) {
            setError(apiMessage(err, 'Could not send the reset link. Try again in a minute.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell
            sheet="A5"
            title="Forgot password"
            lede="Tell us your sign-in email and we'll send a link to choose a new password."
            aside={
                <div className="flex flex-1 flex-col justify-center px-12 py-10 xl:px-16">
                    <p className="label mb-2">Fig. E — the board you're returning to</p>
                    <StageLadder />
                </div>
            }
        >
            {sentTo ? (
                <div role="status" className="flex items-start gap-2.5 text-[15px] text-ink-2">
                    <MailCheck size={18} className="mt-0.5 shrink-0 text-go" />
                    <p className="min-w-0">
                        If <span className="break-all font-medium text-ink">{sentTo}</span> has an account, a reset link is on its way. It expires in 1 hour. Check
                        your spam folder if it doesn't arrive.
                    </p>
                </div>
            ) : (
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
                    <Button type="submit" variant="primary" busy={loading} disabled={!email.trim()} className="h-11 w-full text-[15px]">
                        {loading ? 'Sending' : 'Send reset link'}
                        {!loading && <ArrowRight size={16} />}
                    </Button>
                </form>
            )}
            <p className="mt-5 border-t border-rule pt-4 text-[14px] text-ink-3">
                Remembered it?{' '}
                <Link to="/login" className="link font-medium">
                    Sign in
                </Link>
            </p>
        </AuthShell>
    );
}
