import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { confirmEmailChange } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { apiMessage } from '../lib/errors';
import { sessionStore } from '../lib/session';
import { buttonClass } from '../lib/ui';
import { cn } from '../lib/cn';
import AuthShell, { StageLadder } from '../components/AuthShell';

type State = { status: 'working' } | { status: 'done'; email: string } | { status: 'failed'; message: string };

export default function ConfirmEmail() {
    const [params] = useSearchParams();
    const token = params.get('token');
    const { isAuthenticated } = useAuth();
    const [state, setState] = useState<State>(
        token ? { status: 'working' } : { status: 'failed', message: 'This link is missing its token. Open the link from the email again.' },
    );
    // Links are single-use, and StrictMode runs effects twice in development.
    const sent = useRef(false);

    useEffect(() => {
        if (!token || sent.current) return;
        sent.current = true;
        confirmEmailChange(token)
            .then(({ id, email }) => {
                const session = sessionStore.get();
                if (session?.user.id === id) {
                    sessionStore.set({ ...session, user: { ...session.user, email } });
                }
                setState({ status: 'done', email });
            })
            .catch((err: unknown) => {
                setState({ status: 'failed', message: apiMessage(err, 'Could not confirm the email.') });
            });
    }, [token]);

    const next = isAuthenticated ? { to: '/settings', label: 'Back to settings' } : { to: '/login', label: 'Sign in' };

    return (
        <AuthShell
            sheet="A3"
            title="Confirm email"
            lede="A new sign-in email only takes effect once you open the link we sent to it."
            aside={
                <div className="flex flex-1 flex-col justify-center px-12 py-10 xl:px-16">
                    <p className="label mb-2">Fig. C — the board you're returning to</p>
                    <StageLadder />
                </div>
            }
        >
            {state.status === 'working' && (
                <p className="flex items-center gap-2.5 text-[15px] text-ink-2">
                    <Loader2 size={16} className="animate-spin" aria-hidden /> Confirming your new email…
                </p>
            )}
            {state.status === 'done' && (
                <div role="status" className="flex items-start gap-2.5 text-[15px] text-ink-2">
                    <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-go" />
                    <p className="min-w-0">
                        Confirmed. You now sign in as <span className="break-all font-medium text-ink">{state.email}</span>.
                    </p>
                </div>
            )}
            {state.status === 'failed' && (
                <div role="alert" className="flex items-start gap-2.5 rounded border border-abort/35 bg-abort/[0.06] px-3 py-2.5 text-[14px] text-abort">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    {state.message}
                </div>
            )}
            {state.status !== 'working' && (
                <Link to={next.to} className={cn(buttonClass('primary', 'md'), 'mt-5 h-11 w-full text-[15px]')}>
                    {next.label} <ArrowRight size={16} />
                </Link>
            )}
        </AuthShell>
    );
}
