import { decide, type WorkflowFunction, type WorkflowTask } from 'workflowd';
import {
  ACTIVITY,
  CUSTOM_STEP_CALLBACK_SIGNAL,
  CUSTOM_STEP_WORKFLOW,
  DELIVERY_ATTEMPT_TIMEOUT_MS,
  TENANT_WEBHOOK_WORKFLOW,
  WORKFLOWS,
  customStepWorkflow,
  tenantWebhookWorkflow,
  type CustomStepInput,
  type TenantWebhookInput,
} from './workflows';

// These replay the workflows with the SDK's own decide(): given the history so far, what
// does the workflow ask the engine for next. It is pure, so no engine is needed.

type Step = Record<string, unknown>;

const STARTED = '2026-10-22T12:00:00.000Z';

const task = (input: unknown, steps: Step[] = []): WorkflowTask => ({
  workflow_id: 'wf-1',
  started_at: STARTED,
  input: JSON.stringify(input),
  steps,
});

const completed = (
  kind: string,
  stepName: string,
  output: unknown,
  resolvedAt: string,
  eventId: number,
): Step => ({
  kind,
  step_name: stepName,
  status: 'COMPLETED',
  output: typeof output === 'string' ? output : JSON.stringify(output),
  resolved_at: resolvedAt,
  resolved_event_id: eventId,
});

const failed = (stepName: string, error: string, nonRetryable: boolean) => ({
  kind: 'ACTIVITY',
  step_name: stepName,
  status: 'FAILED',
  error,
  error_type: nonRetryable ? 'NonRetryableError' : '',
  non_retryable: nonRetryable,
  resolved_at: '2026-10-22T12:00:01.000Z',
  resolved_event_id: 3,
});

const scheduled = (kind: string, stepName: string): Step => ({
  kind,
  step_name: stepName,
  status: 'SCHEDULED',
});

async function next(fn: WorkflowFunction, workflowTask: WorkflowTask) {
  const decision = await decide(fn, workflowTask);
  expect(decision.replayError).toBeUndefined();
  return decision.commands ?? [];
}

const deliveryCommand = {
  type: 'schedule_activity',
  retry_policy: {
    max_attempts: 6,
    initial_backoff_ms: 5_000,
    max_backoff_ms: 60_000,
  },
  start_to_close_timeout_ms: DELIVERY_ATTEMPT_TIMEOUT_MS,
  sequence: 1,
};

describe('customStepWorkflow', () => {
  const call: CustomStepInput = {
    callId: 'call-1',
    deadline: '2026-10-22T12:05:00.000Z',
  };
  const sent = (output: unknown, at = '2026-10-22T12:00:30.000Z') =>
    completed('ACTIVITY', ACTIVITY.sendCustomStep, output, at, 3);

  it('sends the request with the durable retry policy and a per-attempt timeout', async () => {
    await expect(next(customStepWorkflow, task(call))).resolves.toEqual([
      {
        ...deliveryCommand,
        step_name: ACTIVITY.sendCustomStep,
        input: JSON.stringify(call),
      },
    ]);
  });

  it('then waits for the callback until the deadline, timed from when the request went through', async () => {
    const commands = await next(
      customStepWorkflow,
      task(call, [sent({ status: 202 })]),
    );

    expect(commands).toEqual([
      {
        type: 'await_signal',
        step_name: 'await-callback',
        signal_name: CUSTOM_STEP_CALLBACK_SIGNAL,
        sequence: 2,
      },
      {
        type: 'start_timer',
        step_name: 'await-callback.timeout',
        delay_ms: 4.5 * 60_000,
        sequence: 3,
      },
    ]);
  });

  it('waits no time at all when the deadline passed before the request went through', async () => {
    const commands = await next(
      customStepWorkflow,
      task(call, [sent({ status: 202 }, '2026-10-22T12:06:00.000Z')]),
    );

    expect(commands[1]).toMatchObject({ type: 'start_timer', delay_ms: 0 });
  });

  it('finishes when the company calls back, and drops the deadline', async () => {
    const commands = await next(
      customStepWorkflow,
      task(call, [
        sent({ status: 202 }),
        completed(
          'SIGNAL',
          'await-callback',
          { outcome: 'SUCCESS' },
          '2026-10-22T12:01:00.000Z',
          6,
        ),
        scheduled('TIMER', 'await-callback.timeout'),
      ]),
    );

    expect(commands).toEqual([
      expect.objectContaining({ type: 'cancel_step', sequence: 3 }),
      { type: 'complete_workflow', output: 'called back' },
    ]);
  });

  it('times the step out when the deadline comes first', async () => {
    const commands = await next(
      customStepWorkflow,
      task(call, [
        sent({ status: 202 }),
        scheduled('SIGNAL', 'await-callback'),
        completed(
          'TIMER',
          'await-callback.timeout',
          '',
          '2026-10-22T12:05:00.000Z',
          6,
        ),
      ]),
    );

    expect(commands).toEqual([
      expect.objectContaining({ type: 'cancel_step', sequence: 2 }),
      expect.objectContaining({
        type: 'schedule_activity',
        step_name: ACTIVITY.customStepDeadline,
        input: JSON.stringify({ callId: 'call-1' }),
        sequence: 4,
      }),
    ]);
  });

  it.each([
    ['the company rejects it', 'rejected with 400', true],
    ['every retry is spent', 'answered 503', false],
  ])(
    'fails the step when %s',
    async (_case, error: string, nonRetryable: boolean) => {
      const commands = await next(
        customStepWorkflow,
        task(call, [failed(ACTIVITY.sendCustomStep, error, nonRetryable)]),
      );

      expect(commands).toEqual([
        expect.objectContaining({
          type: 'schedule_activity',
          step_name: ACTIVITY.customStepUndelivered,
          input: JSON.stringify({ callId: 'call-1', error }),
          sequence: 2,
        }),
      ]);
    },
  );

  it('stops when the request no longer matters', async () => {
    await expect(
      next(customStepWorkflow, task(call, [sent({ abandoned: true })])),
    ).resolves.toEqual([
      { type: 'complete_workflow', output: 'no longer needed' },
    ]);
  });
});

describe('tenantWebhookWorkflow', () => {
  const input: TenantWebhookInput = { tenantId: 't1', event: 'tenant.active' };
  const delivered = (output: unknown) =>
    completed(
      'ACTIVITY',
      ACTIVITY.deliverWebhook,
      output,
      '2026-10-22T12:00:01.000Z',
      3,
    );

  it('delivers with the durable retry policy and a per-attempt timeout', async () => {
    await expect(next(tenantWebhookWorkflow, task(input))).resolves.toEqual([
      {
        ...deliveryCommand,
        step_name: ACTIVITY.deliverWebhook,
        input: JSON.stringify(input),
      },
    ]);
  });

  it.each([
    [{ status: 200 }, 'delivered (200)'],
    [{ skipped: true }, 'no webhook configured'],
    // What the 0.1 code recorded; the engine's finished histories hold these.
    [{ delivered: true, status: 204 }, 'delivered (204)'],
    [{ delivered: false, skipped: true }, 'no webhook configured'],
  ])('finishes on %j with "%s"', async (output, result) => {
    await expect(
      next(tenantWebhookWorkflow, task(input, [delivered(output)])),
    ).resolves.toEqual([{ type: 'complete_workflow', output: result }]);
  });

  it('fails the workflow when the receiver rejects it', async () => {
    await expect(
      next(
        tenantWebhookWorkflow,
        task(input, [
          failed(ACTIVITY.deliverWebhook, 'rejected with 410', true),
        ]),
      ),
    ).resolves.toEqual([{ type: 'fail_workflow', error: 'rejected with 410' }]);
  });
});

it('registers both workflows by type', () => {
  expect(Object.keys(WORKFLOWS).sort()).toEqual(
    [CUSTOM_STEP_WORKFLOW, TENANT_WEBHOOK_WORKFLOW].sort(),
  );
});
