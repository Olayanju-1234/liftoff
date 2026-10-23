import { STAGES, billingSkip, quietFor, stageState, stepMode } from './pipeline';
import type { Condition, Timeline } from './pipeline';
import type { Tenant } from './types';
import { fmtDuration } from './time';
import type { BoxView, CoreView } from '../components/pipeline/Schematic';

// How one tenant's state reads on the schematic: the core, and each worker's box.
export const CORE_TONE: Record<Condition, CoreView['tone']> = {
    active: 'go',
    running: 'run',
    stalled: 'stall',
    waiting: 'idle',
    failed: 'fail',
    cancelled: 'cancel',
    suspended: 'cancel',
    removing: 'cancel',
    removed: 'cancel',
};

export function buildBoxes(tenant: Tenant, timeline: Timeline, now: number): BoxView[] {
    return STAGES.map((stage, i) => {
        const state = stageState(tenant, stage, now);
        const { start, end } = timeline.stages[i];
        const mode = stepMode(tenant, stage.api);
        if (mode === 'skipped' && state === 'SKIPPED') {
            return { tone: 'idle', badge: 'SKIPPED', meta: 'step settings' };
        }
        if (mode === 'custom' && state === 'IN_PROGRESS') {
            return { tone: 'run', badge: 'YOUR SYSTEM', meta: start !== undefined ? fmtDuration(now - start) : undefined };
        }
        switch (state) {
            case 'SUCCESS':
                return {
                    tone: 'ok',
                    badge: mode === 'custom' ? 'DONE · CUSTOM' : 'DONE',
                    meta: start !== undefined && end !== undefined ? fmtDuration(end - start) : undefined,
                };
            case 'IN_PROGRESS':
                return { tone: 'run', badge: 'IN FLIGHT', meta: start !== undefined ? fmtDuration(now - start) : undefined };
            case 'STALLED':
                return { tone: 'stall', badge: 'STALLED', meta: fmtDuration(quietFor(tenant, now)), dlq: true };
            case 'FAILED':
                return { tone: 'fail', badge: mode === 'custom' ? 'FAILED · CUSTOM' : 'FAILED', dlq: mode !== 'custom' };
            case 'CANCELLED':
                return { tone: 'cancel', badge: 'CANCELLED' };
            case 'SKIPPED':
                return {
                    tone: 'idle',
                    badge: 'SKIPPED',
                    meta: stage.key === 'notificationStatus' ? 'nothing sent' : billingSkip(tenant) === 'test' ? 'test tenant' : 'Stripe not connected',
                };
            default:
                return { tone: 'idle', badge: 'PENDING' };
        }
    });
}
