import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { getApiKeys, getMe, getOrganisation, resendVerification, updateOrganisation } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { apiMessage } from '../lib/errors';
import { useResource } from '../lib/hooks';
import { onboardingComplete, onboardingItems } from '../lib/onboarding';
import type { OnboardingItem } from '../lib/onboarding';
import { sessionStore } from '../lib/session';
import { cn } from '../lib/cn';
import type { Tenant } from '../lib/types';
import Panel from './ui/Panel';
import Button from './ui/Button';

interface OnboardingChecklistProps {
    tenants: Tenant[];
    onAddTestCustomer: () => void;
}

// Shown on the Simple home until every item is done and someone dismisses it. Each tick
// comes from the API, so the card reappears if a key is revoked or the webhook removed.
export default function OnboardingChecklist({ tenants, onAddTestCustomer }: OnboardingChecklistProps) {
    const { user } = useAuth();
    const me = useResource(async () => {
        const fresh = await getMe();
        // The stored session can predate verification; keep the banner and this card in step.
        const session = sessionStore.get();
        if (session && session.user.emailVerified !== fresh.emailVerified) {
            sessionStore.set({ ...session, user: { ...session.user, emailVerified: fresh.emailVerified } });
        }
        return fresh;
    });
    const organisation = useResource(getOrganisation);
    const apiKeys = useResource(getApiKeys);
    const [dismissed, setDismissed] = useState(false);
    const [dismissing, setDismissing] = useState(false);
    const [resending, setResending] = useState(false);
    const [resent, setResent] = useState(false);

    if (dismissed || me.loading || !organisation.data || !apiKeys.data) return null;
    if (organisation.data.onboardingDismissedAt) return null;

    const items = onboardingItems({
        emailVerified: me.data?.emailVerified ?? user?.emailVerified ?? false,
        organisation: organisation.data,
        apiKeys: apiKeys.data,
        tenants,
    });
    const done = items.filter((i) => i.done).length;
    const complete = onboardingComplete(items);

    const dismiss = async () => {
        setDismissing(true);
        try {
            await updateOrganisation({ dismissOnboarding: true });
            setDismissed(true);
        } catch (err) {
            toast.error(apiMessage(err, 'Could not hide the checklist.'));
        } finally {
            setDismissing(false);
        }
    };

    const resend = async () => {
        setResending(true);
        try {
            const { message } = await resendVerification();
            setResent(true);
            toast.success(message);
        } catch (err) {
            toast.error(apiMessage(err, 'Could not send the verification email.'));
        } finally {
            setResending(false);
        }
    };

    const action = (item: OnboardingItem) => {
        if (item.done) {
            return <span className="font-mono text-[10.5px] uppercase tracking-[0.07em] text-go">Done</span>;
        }
        switch (item.key) {
            case 'verify-email':
                return (
                    <Button size="sm" onClick={resend} busy={resending} disabled={resent}>
                        {resent ? 'Sent' : 'Resend link'}
                    </Button>
                );
            case 'test-customer':
                return (
                    <Button size="sm" variant="primary" onClick={onAddTestCustomer}>
                        <Plus size={13} /> Add test customer
                    </Button>
                );
            default:
                return (
                    <Link
                        to={item.to ?? '/settings'}
                        className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-medium text-blueprint hover:underline"
                    >
                        Set up <ArrowRight size={13} />
                    </Link>
                );
        }
    };

    return (
        <Panel
            title={complete ? "You're all set" : 'Getting started'}
            meta={`${done} of ${items.length} done`}
            actions={
                complete ? (
                    <Button size="sm" onClick={dismiss} busy={dismissing}>
                        Dismiss
                    </Button>
                ) : undefined
            }
            flush
            className={cn('mb-6', complete && 'border-go/40')}
        >
            <div className="flex gap-1 border-b border-rule px-4 py-2.5 sm:px-5" aria-hidden>
                {items.map((item) => (
                    <span key={item.key} className={cn('h-1 flex-1 rounded-[1px]', item.done ? 'bg-go' : 'bg-rule-strong')} />
                ))}
            </div>
            <ol className="divide-y divide-rule">
                {items.map((item, i) => (
                    <li key={item.key} className="flex items-center gap-4 px-4 py-3 sm:px-5">
                        <span
                            className={cn(
                                'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border font-mono text-[11px] font-medium',
                                item.done ? 'border-go bg-go text-card' : 'border-rule-strong bg-card text-ink-3',
                            )}
                            aria-label={item.done ? 'Done' : 'To do'}
                        >
                            {item.done ? <Check size={14} /> : i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className={cn('text-[15px] font-medium', item.done ? 'text-ink-3 line-through decoration-ink-4' : 'text-ink')}>{item.title}</p>
                            {!item.done && <p className="text-[13px] text-ink-3">{item.body}</p>}
                        </div>
                        <div className="shrink-0">{action(item)}</div>
                    </li>
                ))}
            </ol>
            {complete && (
                <p className="border-t border-rule px-4 py-2.5 text-[12.5px] text-ink-3 sm:px-5">
                    Your signup flow can add customers on its own now. Dismiss this card and it won't come back.
                </p>
            )}
        </Panel>
    );
}
