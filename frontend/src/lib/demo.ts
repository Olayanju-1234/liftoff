import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { startDemo } from './api';
import { apiMessage } from './errors';
import type { StepName } from './types';

// The same five names as the delivery ticket, so nobody needs to know the services.
export const DEMO_STEP_LABEL: Record<StepName, string> = {
    database: 'Database',
    address: 'Address',
    credentials: 'API keys',
    billing: 'Trial',
    welcome: 'Welcome',
};

// The same steps mid-sentence.
export const DEMO_STEP_NOUN: Record<StepName, string> = {
    database: 'database',
    address: 'address',
    credentials: 'API keys',
    billing: 'trial',
    welcome: 'welcome',
};

// Why a demo run skips a step, said once so the page never claims a skipped step happened.
export const DEMO_SKIP_REASON: Partial<Record<StepName, string>> = {
    billing: 'nobody is billed for a test customer',
    welcome: 'the pretend company has nobody to email',
};

export function joinWords(words: string[]): string {
    return words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

export const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// Starts a real run and opens it. Callers keep the animation on screen, so a refusal still leaves something to watch.
export function useStartDemo() {
    const navigate = useNavigate();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const start = async (failStep?: StepName) => {
        setBusy(true);
        setError(null);
        try {
            const run = await startDemo(failStep);
            navigate(`/demo/${run.token}`);
        } catch (err) {
            // The gateway's per-visitor limit; the service's own "busy" message explains itself.
            const throttled = isAxiosError(err) && err.response?.status === 429 && String(apiMessage(err, '')).startsWith('ThrottlerException');
            setError(
                throttled
                    ? 'You have started a few live runs already. Give it a while, or watch the animation of the same flow.'
                    : apiMessage(err, 'The live run could not start. The animation shows the same flow.'),
            );
            setBusy(false);
        }
    };

    return { start, busy, error };
}
