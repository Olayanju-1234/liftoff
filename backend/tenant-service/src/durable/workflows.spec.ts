import type { Context } from 'workflowd';
import {
  ACTIVITY,
  CUSTOM_STEP_CALLBACK_SIGNAL,
  CUSTOM_STEP_WORKFLOW,
  DELIVERY_RETRY,
  TENANT_WEBHOOK_WORKFLOW,
  WORKFLOWS,
  customStepWorkflow,
  tenantWebhookWorkflow,
  type CustomStepInput,
  type TenantWebhookInput,
} from './workflows';

interface Script {
  // What each activity call resolves to (or rejects with, for an Error).
  activity: (name: string, input: unknown) => unknown;
  // Which of the raced promises settles first: 0 the callback, 1 the deadline.
  first?: number;
  now?: number;
}

// A stand-in for the SDK's replay context: it records what the workflow asks for, and
// answers from the script. Waits never settle on their own, as in a real first pass.
function fakeContext(input: unknown, script: Script) {
  const activities: Array<{ name: string; input: unknown; opts: unknown }> = [];
  const sleeps: Array<{ name: string; ms: number }> = [];
  const signals: string[] = [];
  const never = () => new Promise<never>(() => undefined);
  const ctx = {
    input: JSON.stringify(input),
    workflowId: 'wf-1',
    inputAs: () => input,
    activity: (name: string, payload: unknown, opts: unknown) => {
      activities.push({ name, input: payload, opts });
      const answer = script.activity(name, payload);
      return answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve(answer);
    },
    sleep: (name: string, ms: number) => {
      sleeps.push({ name, ms });
      return never();
    },
    waitForSignal: (_name: string, signal: string) => {
      signals.push(signal);
      return never();
    },
    waitAny: () => Promise.resolve(script.first ?? 0),
    sideEffect: (_name: string, fn: () => unknown) =>
      Promise.resolve(String(script.now ?? fn())),
  } as unknown as Context;
  return { ctx, activities, sleeps, signals };
}

const NOW = Date.parse('2026-10-22T12:00:00.000Z');
const call: CustomStepInput = {
  callId: 'call-1',
  deadline: '2026-10-22T12:05:00.000Z',
  deliveryId: 'call-1',
};

describe('customStepWorkflow', () => {
  it('sends with the durable retry policy, then waits for the callback until the deadline', async () => {
    const { ctx, activities, sleeps, signals } = fakeContext(call, {
      activity: () => ({ delivered: true, status: 202 }),
      first: 0,
      now: NOW,
    });

    await expect(customStepWorkflow(ctx)).resolves.toBe('called back');

    expect(activities).toEqual([
      {
        name: ACTIVITY.sendCustomStep,
        input: call,
        opts: { as: 'json', retry: DELIVERY_RETRY },
      },
    ]);
    expect(signals).toEqual([CUSTOM_STEP_CALLBACK_SIGNAL]);
    expect(sleeps).toEqual([{ name: 'deadline', ms: 5 * 60_000 }]);
  });

  it('times the step out when the deadline comes first', async () => {
    const { ctx, activities } = fakeContext(call, {
      activity: () => ({ delivered: true, status: 200 }),
      first: 1,
      now: NOW,
    });

    await expect(customStepWorkflow(ctx)).resolves.toBe('deadline passed');

    expect(activities.map((a) => a.name)).toEqual([
      ACTIVITY.sendCustomStep,
      ACTIVITY.customStepDeadline,
    ]);
    expect(activities[1].input).toEqual({ callId: 'call-1' });
  });

  it('waits no time at all when the deadline has already passed', async () => {
    const { ctx, sleeps } = fakeContext(call, {
      activity: () => ({ delivered: true }),
      first: 1,
      now: Date.parse(call.deadline) + 1_000,
    });

    await customStepWorkflow(ctx);

    expect(sleeps).toEqual([{ name: 'deadline', ms: 0 }]);
  });

  it('fails the step when the company rejects the request', async () => {
    const { ctx, activities, sleeps } = fakeContext(call, {
      activity: (name) =>
        name === ACTIVITY.sendCustomStep
          ? { delivered: false, status: 400, error: 'rejected with 400' }
          : true,
    });

    await expect(customStepWorkflow(ctx)).resolves.toBe('not delivered');

    expect(activities[1]).toMatchObject({
      name: ACTIVITY.customStepUndelivered,
      input: { callId: 'call-1', error: 'rejected with 400' },
    });
    expect(sleeps).toEqual([]);
  });

  it('fails the step once every retry is spent', async () => {
    const { ctx, activities } = fakeContext(call, {
      activity: (name) =>
        name === ACTIVITY.sendCustomStep ? new Error('answered 503') : true,
    });

    await expect(customStepWorkflow(ctx)).resolves.toBe('not delivered');

    expect(activities[1]).toMatchObject({
      name: ACTIVITY.customStepUndelivered,
      input: { callId: 'call-1', error: 'answered 503' },
    });
  });

  it('stops when the request no longer matters', async () => {
    const { ctx, activities, sleeps } = fakeContext(call, {
      activity: () => ({ delivered: false, abandoned: true }),
    });

    await expect(customStepWorkflow(ctx)).resolves.toBe('no longer needed');

    expect(activities).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });
});

describe('tenantWebhookWorkflow', () => {
  const input: TenantWebhookInput = {
    tenantId: 't1',
    event: 'tenant.active',
    deliveryId: 'd-1',
  };

  it('delivers with the durable retry policy', async () => {
    const { ctx, activities } = fakeContext(input, {
      activity: () => ({ delivered: true, status: 200 }),
    });

    await expect(tenantWebhookWorkflow(ctx)).resolves.toBe('delivered (200)');
    expect(activities).toEqual([
      {
        name: ACTIVITY.deliverWebhook,
        input,
        opts: { as: 'json', retry: DELIVERY_RETRY },
      },
    ]);
  });

  it('finishes quietly when the organisation has no webhook', async () => {
    const { ctx } = fakeContext(input, {
      activity: () => ({ delivered: false, skipped: true }),
    });

    await expect(tenantWebhookWorkflow(ctx)).resolves.toBe(
      'no webhook configured',
    );
  });

  it('fails the workflow when the receiver rejects it', async () => {
    const { ctx } = fakeContext(input, {
      activity: () => ({
        delivered: false,
        status: 410,
        error: 'rejected with 410',
      }),
    });

    await expect(tenantWebhookWorkflow(ctx)).rejects.toThrow(
      'tenant.active was not delivered: rejected with 410',
    );
  });
});

it('registers both workflows by type', () => {
  expect(Object.keys(WORKFLOWS).sort()).toEqual(
    [CUSTOM_STEP_WORKFLOW, TENANT_WEBHOOK_WORKFLOW].sort(),
  );
});
