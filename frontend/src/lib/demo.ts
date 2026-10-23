import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { startDemo } from './api';
import { apiMessage } from './errors';
import { STAGES } from './pipeline';
import type { Stage, StepKey } from './pipeline';
import type { DemoFailStep } from './types';

export const DEMO_FAIL_STEP: Record<StepKey, DemoFailStep> = {
    dbStatus: 'db',
    dnsStatus: 'dns',
    credentialsStatus: 'credentials',
    billingStatus: 'billing',
    notificationStatus: 'notification',
};

export const stageForFailStep = (step: DemoFailStep): Stage => STAGES.find((s) => DEMO_FAIL_STEP[s.key] === step) ?? STAGES[0];

export type FailChoice = DemoFailStep | 'none';

export const FAIL_CHOICES: { value: FailChoice; label: string }[] = [
    { value: 'none', label: 'None' },
    ...STAGES.map((s) => ({ value: DEMO_FAIL_STEP[s.key], label: s.short })),
];

// Why no live demo started, in words a visitor can act on. A 429 carries the API's own reason.
export function demoUnavailableReason(err: unknown): string {
    if (isAxiosError(err) && err.response?.status === 429) {
        return apiMessage(err, 'The live demo is busy right now.');
    }
    return 'The live demo is not answering right now.';
}

// Starts a real demo customer and opens its live view. On failure it keeps the reason, so
// the page can fall back to the replay that runs in the browser.
export function useStartDemo() {
    const navigate = useNavigate();
    const [starting, setStarting] = useState<FailChoice | null>(null);
    const [error, setError] = useState<string | null>(null);

    const start = useCallback(
        async (choice: FailChoice = 'none') => {
            setStarting(choice);
            setError(null);
            try {
                const demo = await startDemo(choice === 'none' ? undefined : choice);
                navigate(`/demo/${demo.token}`);
            } catch (err) {
                setError(demoUnavailableReason(err));
            } finally {
                setStarting(null);
            }
        },
        [navigate],
    );

    return { start, starting, error, clearError: () => setError(null) };
}

export function fmtCountdown(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
