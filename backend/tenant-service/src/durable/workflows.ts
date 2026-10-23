import type {
  ActivityOptions,
  ActivityTask,
  Context,
  RetryPolicy,
  WorkflowFunction,
} from 'workflowd';
import type { TenantWebhookEvent } from '@liftoff/shared-types';

// Workflows run by a workflowd engine when WORKFLOWD_ADDR is set. They only orchestrate:
// every side effect is an activity registered by the service that owns it.

export const CUSTOM_STEP_WORKFLOW = 'liftoff.custom-step';
export const TENANT_WEBHOOK_WORKFLOW = 'liftoff.tenant-webhook';
export const CUSTOM_STEP_CALLBACK_SIGNAL = 'callback';

export const ACTIVITY = {
  sendCustomStep: 'liftoff.custom-step.send',
  customStepUndelivered: 'liftoff.custom-step.undelivered',
  customStepDeadline: 'liftoff.custom-step.deadline',
  deliverWebhook: 'liftoff.webhook.deliver',
} as const;

// The engine keeps the backoff, so a delivery can outlast a restart of liftoff or of the
// receiver: six attempts over about two and a half minutes.
export const DELIVERY_RETRY: RetryPolicy = {
  maxAttempts: 6,
  initialBackoffMs: 5_000,
  maxBackoffMs: 60_000,
};
// The POST gives up after 10 s; this also bounds the database and DNS lookups around it.
export const DELIVERY_ATTEMPT_TIMEOUT_MS = 30_000;
export const DELIVERY_OPTIONS: ActivityOptions & { as: 'json' } = {
  as: 'json',
  retry: DELIVERY_RETRY,
  startToCloseTimeoutMs: DELIVERY_ATTEMPT_TIMEOUT_MS,
};
// Follow-ups only touch liftoff's own database.
export const FOLLOW_UP_RETRY: RetryPolicy = {
  maxAttempts: 5,
  initialBackoffMs: 1_000,
  maxBackoffMs: 30_000,
};

export interface CustomStepInput {
  callId: string;
  deadline: string;
}

export interface TenantWebhookInput {
  tenantId: string;
  event: TenantWebhookEvent;
}

// What a delivery activity knows about the attempt it is making.
export type DeliveryAttempt = Pick<ActivityTask, 'activityId' | 'attempt'>;

// A delivery that went through, or one with nothing left to send. A failure is thrown
// instead: retried by the engine, or at once final for an answer that won't change.
export interface DeliveryOutcome {
  // The receiver's 2xx.
  status?: number;
  // The request no longer matters: a callback, the deadline or a cancel closed it.
  abandoned?: boolean;
  // Nothing to deliver to, such as an organisation without a webhook URL.
  skipped?: boolean;
}

export const customStepWorkflowId = (callId: string): string =>
  `liftoff-custom-step-${callId}`;
export const tenantWebhookWorkflowId = (key: string): string =>
  `liftoff-webhook-${key}`;

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// Send the request, then wait for the company's callback until the deadline. The callback
// itself is recorded by the HTTP handler; the signal only ends the wait.
export async function customStepWorkflow(ctx: Context): Promise<string> {
  const input = ctx.inputAs<CustomStepInput>('json');
  let sent: DeliveryOutcome;
  try {
    sent = await ctx.activity<DeliveryOutcome>(
      ACTIVITY.sendCustomStep,
      input,
      DELIVERY_OPTIONS,
    );
  } catch (error) {
    await ctx.activity(
      ACTIVITY.customStepUndelivered,
      { callId: input.callId, error: messageOf(error) },
      { retry: FOLLOW_UP_RETRY },
    );
    return 'not delivered';
  }
  if (sent.abandoned) {
    return 'no longer needed';
  }

  // ctx.now() is when the request went through, the same on every replay.
  const callback = await ctx.waitForSignal(
    'await-callback',
    CUSTOM_STEP_CALLBACK_SIGNAL,
    {
      timeoutMs: Math.max(0, Date.parse(input.deadline) - ctx.now().getTime()),
    },
  );
  if (callback !== undefined) {
    return 'called back';
  }
  await ctx.activity(
    ACTIVITY.customStepDeadline,
    { callId: input.callId },
    { retry: FOLLOW_UP_RETRY },
  );
  return 'deadline passed';
}

// A rejected delivery, or one that failed every retry, fails the workflow, which is what
// the engine's dashboard shows.
export async function tenantWebhookWorkflow(ctx: Context): Promise<string> {
  const input = ctx.inputAs<TenantWebhookInput>('json');
  const outcome = await ctx.activity<DeliveryOutcome>(
    ACTIVITY.deliverWebhook,
    input,
    DELIVERY_OPTIONS,
  );
  return outcome.skipped
    ? 'no webhook configured'
    : `delivered (${outcome.status ?? 'ok'})`;
}

export const WORKFLOWS: Record<string, WorkflowFunction> = {
  [CUSTOM_STEP_WORKFLOW]: customStepWorkflow,
  [TENANT_WEBHOOK_WORKFLOW]: tenantWebhookWorkflow,
};
