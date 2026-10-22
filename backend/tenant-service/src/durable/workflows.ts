import type { Context, RetryPolicy, WorkflowFunction } from 'workflowd';
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
// Follow-ups only touch liftoff's own database.
export const FOLLOW_UP_RETRY: RetryPolicy = {
  maxAttempts: 5,
  initialBackoffMs: 1_000,
  maxBackoffMs: 30_000,
};

export interface CustomStepInput {
  callId: string;
  deadline: string;
  deliveryId: string;
}

export interface TenantWebhookInput {
  tenantId: string;
  event: TenantWebhookEvent;
  deliveryId: string;
}

// What one delivery attempt reports. A retryable failure is thrown instead, so the engine
// retries it; these are the answers that settle the delivery.
export interface DeliveryOutcome {
  delivered: boolean;
  status?: number;
  error?: string;
  // The request no longer matters: a callback, the deadline or a cancel closed it.
  abandoned?: boolean;
  // Nothing to deliver to, such as an organisation without a webhook URL.
  skipped?: boolean;
}

export const customStepWorkflowId = (callId: string): string =>
  `liftoff-custom-step-${callId}`;
export const tenantWebhookWorkflowId = (deliveryId: string): string =>
  `liftoff-webhook-${deliveryId}`;

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// Send the request, then wait for the company's callback or the deadline, whichever is
// first. The callback itself is recorded by the HTTP handler; the signal only ends the wait.
export async function customStepWorkflow(ctx: Context): Promise<string> {
  const input = ctx.inputAs<CustomStepInput>('json');
  let sent: DeliveryOutcome;
  try {
    sent = await ctx.activity<DeliveryOutcome>(ACTIVITY.sendCustomStep, input, {
      as: 'json',
      retry: DELIVERY_RETRY,
    });
  } catch (error) {
    sent = { delivered: false, error: messageOf(error) };
  }
  if (sent.abandoned) {
    return 'no longer needed';
  }
  if (!sent.delivered) {
    await ctx.activity(
      ACTIVITY.customStepUndelivered,
      { callId: input.callId, error: sent.error ?? 'no answer' },
      { retry: FOLLOW_UP_RETRY },
    );
    return 'not delivered';
  }

  // Read the clock through sideEffect, so every replay computes the same wait.
  const now = Number(await ctx.sideEffect('now', () => Date.now()));
  const callback = ctx.waitForSignal(
    'await-callback',
    CUSTOM_STEP_CALLBACK_SIGNAL,
  );
  const deadline = ctx.sleep(
    'deadline',
    Math.max(0, Date.parse(input.deadline) - now),
  );
  if ((await ctx.waitAny([callback, deadline])) === 0) {
    return 'called back';
  }
  await ctx.activity(
    ACTIVITY.customStepDeadline,
    { callId: input.callId },
    { retry: FOLLOW_UP_RETRY },
  );
  return 'deadline passed';
}

// A failure after every retry fails the workflow, which is what the engine's dashboard shows.
export async function tenantWebhookWorkflow(ctx: Context): Promise<string> {
  const input = ctx.inputAs<TenantWebhookInput>('json');
  const outcome = await ctx.activity<DeliveryOutcome>(
    ACTIVITY.deliverWebhook,
    input,
    { as: 'json', retry: DELIVERY_RETRY },
  );
  if (outcome.skipped) {
    return 'no webhook configured';
  }
  if (!outcome.delivered) {
    throw new Error(
      `${input.event} was not delivered: ${outcome.error ?? 'no answer'}`,
    );
  }
  return `delivered (${outcome.status ?? 'ok'})`;
}

export const WORKFLOWS: Record<string, WorkflowFunction> = {
  [CUSTOM_STEP_WORKFLOW]: customStepWorkflow,
  [TENANT_WEBHOOK_WORKFLOW]: tenantWebhookWorkflow,
};
