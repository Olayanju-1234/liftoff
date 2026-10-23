import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { errorMessage } from '../common/error-message';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { AmqpConnection, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import {
  Prisma,
  StepStatus,
  TenantStatus,
  type CustomStepCall,
  type Tenant,
} from '.prisma/tenant-client';
import {
  LIVE_TENANT_STATUSES,
  PROVISIONING_STEP_NAMES,
  isLiveTenant,
  type CustomStepAction,
  type DeprovisionPart,
  type CompleteStepDto,
  type EffectiveStepConfigEntry,
  type FailStepDto,
  type ProvisioningStepName,
  type StepCallbackResult,
  type StepMode,
  type ProvisioningCompletePayload,
  TenantDeprovisionDonePayload,
  TenantDeprovisionPayload,
  TenantFailedPayload,
  TenantRequestedPayload,
  TenantDbReadyPayload,
  TenantDnsReadyPayload,
  TenantCredentialsReadyPayload,
  TenantBillingActivePayload,
} from '@liftoff/shared-types';
import {
  DEAD_LETTER_EXCHANGE,
  DEAD_LETTER_KEY_BY_STEP,
  DEAD_LETTER_ROUTING_KEYS,
  DEMO_FAILURE_HEADER,
  STEP_BY_DEAD_LETTER_KEY,
  TEARDOWN_BY_DEAD_LETTER_KEY,
  TEARDOWN_STEP_BY_PART,
  describeDeadLetter,
  type DeadLetterMessage,
  type ProvisioningStep,
  type TeardownStep,
} from './dead-letters';
import { WebhookService } from '../webhooks/webhook.service';
import { DurableService } from '../durable/durable.service';
import {
  ACTIVITY,
  CUSTOM_STEP_CALLBACK_SIGNAL,
  CUSTOM_STEP_WORKFLOW,
  customStepWorkflowId,
  type CustomStepInput,
} from '../durable/workflows';
import { legacySchemaName, schemaNameFor, withAddress } from './address';
import { STEP_INPUT, rebuildInput, storedInput } from './retry';
import { QuotasService } from './quotas.service';
import { StatusTokenService } from '../status/status-token.service';
import { newTenantId } from './ids';
import {
  effectivePlans,
  planNameFor,
  resolvePlanId,
} from '../organisations/customer-plans';
import { PLAN_CATALOG } from './plans';
import type { CustomerPlan, PlanId } from '@liftoff/shared-types';
import { stepConfigFor } from '../organisations/step-config';
import {
  STEP_COLUMN,
  STEP_FOR_PART,
  STEP_NAME,
  TEARDOWN_COLUMN,
  nextStep,
  ranAs,
  storedStepModes,
} from './steps';
import {
  CustomStepsService,
  type CustomStepView,
} from './custom-steps.service';

const PUBLISH_TIMEOUT_MS = 5_000;

const PROVISIONING_STEPS: ProvisioningStep[] = [
  'dbStatus',
  'dnsStatus',
  'credentialsStatus',
  'billingStatus',
  'notificationStatus',
];
const TEARDOWN_STEPS: TeardownStep[] = Object.values(TEARDOWN_STEP_BY_PART);
// Step results are recorded for these; the rest are gone and ignore late workers.
const LIVE: TenantStatus[] = [...LIVE_TENANT_STATUSES];
// Only these can still be failed or activated. FAILED stays eligible so a replayed
// step can finish (or fail) the saga again; ACTIVE is never failed by a late dead letter.
const SAGA_OPEN: TenantStatus[] = [
  TenantStatus.PROVISIONING,
  TenantStatus.FAILED,
];
type FinishedOutcome = typeof StepStatus.SUCCESS | typeof StepStatus.SKIPPED;

// What a finished step leaves behind: its event, and what the next builtin worker is sent.
interface StepResult {
  event: string;
  payload: object;
  extra?: Prisma.TenantUpdateManyMutationInput;
  input?: object;
}

// A removal in flight, or done: teardown results still count.
const REMOVING: TenantStatus[] = [
  TenantStatus.DEPROVISIONING,
  TenantStatus.DELETED,
];
const TEARDOWN_FINISHED: StepStatus[] = [
  StepStatus.SUCCESS,
  StepStatus.SKIPPED,
];

const TEARDOWN_EVENT: Record<TenantDeprovisionDonePayload['part'], string> = {
  db: 'tenant.schema.dropped',
  credentials: 'tenant.credentials.revoked',
  billing: 'tenant.billing.cancelled',
};

// Steps that have not finished stop where they are; finished ones keep their status.
function cancelOpenSteps(tenant: Tenant): Prisma.TenantUpdateManyMutationInput {
  const data: Prisma.TenantUpdateManyMutationInput = {};
  for (const step of PROVISIONING_STEPS) {
    if (
      tenant[step] === StepStatus.PENDING ||
      tenant[step] === StepStatus.IN_PROGRESS
    ) {
      data[step] = StepStatus.CANCELLED;
    }
  }
  return data;
}

const teardownUnfinished = (tenant: Tenant) =>
  TEARDOWN_STEPS.some(
    (step) => !tenant[step] || !TEARDOWN_FINISHED.includes(tenant[step]),
  );

// What a tenant response is shaped by: the company's base domain and its customer plans.
interface OrgContext {
  baseDomain: string | null;
  plans: CustomerPlan[];
}

const isUniqueViolation = (
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

// Who a tenant is created for: the company, and the user who clicked (none for an API key).
export interface TenantCreator {
  organisationId: string;
  ownerId: string | null;
}

// Only the live demo passes this: the run's row is written in the same insert as the tenant.
export interface DemoRunOptions {
  failStep: ProvisioningStepName | null;
  expiresAt: Date;
}

// Tenants are the company's customers; its own legacy workspace tenant is not one.
const inOrganisation = (
  organisationId: string,
): Pick<Prisma.TenantWhereInput, 'organisationId' | 'isWorkspace'> => ({
  organisationId,
  isWorkspace: false,
});

@Injectable()
export class TenantsService implements OnModuleInit {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private prisma: PrismaService,
    private readonly amqpConnection: AmqpConnection,
    private readonly webhooks: WebhookService,
    private readonly quotas: QuotasService,
    private readonly statusTokens: StatusTokenService,
    private readonly customSteps: CustomStepsService,
    @Optional() private readonly durable?: DurableService,
  ) {}

  onModuleInit(): void {
    if (!this.durable) {
      return;
    }
    this.durable.activity(ACTIVITY.customStepUndelivered, async (input) => {
      const { callId, error } = input as { callId: string; error: string };
      const call = await this.customSteps.find(callId);
      return call
        ? this.failCustomStep(call, undeliveredMessage(call, error))
        : false;
    });
    this.durable.activity(ACTIVITY.customStepDeadline, async (input) => {
      const { callId } = input as { callId: string };
      const call = await this.customSteps.find(callId);
      return call?.status === StepStatus.IN_PROGRESS
        ? this.timeOutCustomStep(call)
        : false;
    });
  }

  // Every tenant the API returns carries its address, its public status page, the name
  // of its customer plan as the company calls it, and how each step ran.
  private present<
    T extends {
      id: string;
      subdomain: string;
      planId: string;
      stepModes?: Prisma.JsonValue;
    },
  >(tenant: T, context: OrgContext) {
    return {
      ...withAddress(tenant, context.baseDomain),
      statusUrl: this.statusTokens.urlFor(tenant.id),
      planName: planNameFor(context.plans, tenant.planId),
      stepModes: storedStepModes(tenant.stepModes),
    };
  }

  async create(
    createTenantDto: CreateTenantDto,
    creator: TenantCreator,
    demo?: DemoRunOptions,
  ) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: creator.organisationId },
      select: { handle: true, baseDomain: true, plans: true, stepConfig: true },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    // The plan is the customer's plan on the company's product: one of the company's own.
    const context: OrgContext = {
      baseDomain: organisation.baseDomain,
      plans: effectivePlans(organisation.plans),
    };
    const planId = resolvePlanId(context.plans, createTenantDto.planId);
    if (!planId) {
      throw new BadRequestException(
        `Unknown customer plan "${createTenantDto.planId}". Your plans: ${context.plans
          .map((plan) => plan.id)
          .join(', ')}.`,
      );
    }
    const isTest = createTenantDto.test === true;
    if (!isTest) {
      await this.quotas.assertCanProvision(creator.organisationId);
    }

    const plan = await this.ensurePlanRow(planId, organisation.handle);

    try {
      // The id is drawn here so the status token hash can be written in the same insert.
      const id = newTenantId();
      const tenant = await this.prisma.tenant.create({
        data: {
          id,
          name: createTenantDto.name,
          subdomain: createTenantDto.subdomain,
          schemaName: schemaNameFor(
            organisation.handle,
            createTenantDto.subdomain,
          ),
          planId: plan.id,
          organisationId: creator.organisationId,
          ownerId: creator.ownerId,
          isTest,
          statusTokenHash: this.statusTokens.hashFor(id),
          dbStatus: StepStatus.IN_PROGRESS, // Start first step
          ...(demo ? { demo: { create: demo } } : {}),
        },
      });

      if (!isTest) {
        await this.quotas.record(creator.organisationId, tenant.id);
      }
      const first = await this.startProvisioning(
        tenant,
        organisation.stepConfig,
      );

      // A skipped first step has already moved the row on to the next one.
      const current =
        first === 'skipped'
          ? ((await this.prisma.tenant.findUnique({ where: { id } })) ?? tenant)
          : { ...tenant, stepModes: { database: first } };
      return this.present(current, context);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const target = (error.meta?.target as string[] | undefined) ?? [];
        const field =
          target.find((t) => t === 'name' || t === 'subdomain') ??
          'name or subdomain';
        throw new ConflictException(
          `A tenant with this ${field} already exists in your organisation.`,
        );
      }
      throw error;
    }
  }

  // Tenant.planId references the global Plan table, one row per plan id across companies.
  // It is a registry of ids: the name the company gave its plan lives on the organisation.
  private async ensurePlanRow(planId: string, handle: string) {
    const existing = await this.prisma.plan.findUnique({
      where: { id: planId },
    });
    if (existing) {
      return existing;
    }
    const defaults = PLAN_CATALOG[planId as PlanId] ?? {
      name: planId,
      maxUsers: 5,
      maxApiKeys: 3,
    };
    try {
      return await this.prisma.plan.create({
        data: { id: planId, ...defaults },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      // A concurrent create won, or another company's plan already took that name.
      return (
        (await this.prisma.plan.findUnique({ where: { id: planId } })) ??
        this.prisma.plan.create({
          data: { ...defaults, id: planId, name: `${planId} (${handle})` },
        })
      );
    }
  }

  // Callers create the tenant with dbStatus IN_PROGRESS first. Answers how the first
  // step runs; throws 503 when it could not be started (the tenant is then FAILED).
  async startProvisioning(
    tenant: Tenant,
    stepConfig: Prisma.JsonValue | null,
  ): Promise<StepMode> {
    await this.logEvent(tenant.id, 'tenant.created', 'Success', {
      name: tenant.name,
      plan: tenant.planId,
      schema: tenant.schemaName,
      test: tenant.isTest,
    });

    const requested: TenantRequestedPayload = {
      tenantId: tenant.id,
      subdomain: tenant.subdomain,
      planId: tenant.planId,
      ...(tenant.schemaName ? { schemaName: tenant.schemaName } : {}),
      ...(tenant.isTest ? { test: true } : {}),
    };
    const config = stepConfigFor(stepConfig, 'database');
    const started = await this.runStep(tenant, 'database', config, requested);
    if (!started) {
      throw new ServiceUnavailableException(
        'The customer was added but setup could not start. Retry it from the dashboard in a moment.',
      );
    }
    return config.mode;
  }

  async failStep(
    tenantId: string,
    step: ProvisioningStep,
    error: string,
    detail: object = {},
  ): Promise<boolean> {
    const data: Prisma.TenantUpdateManyMutationInput = {
      status: TenantStatus.FAILED,
    };
    data[step] = StepStatus.FAILED;

    const { count } = await this.prisma.tenant.updateMany({
      where: { id: tenantId, status: { in: SAGA_OPEN } },
      data,
    });
    if (count === 0) {
      return false;
    }

    await this.logEvent(tenantId, 'tenant.provisioning.failed', 'Error', {
      step,
      error,
      ...detail,
    });
    this.logger.warn(`Tenant ${tenantId} failed at ${step}: ${error}`);
    this.webhooks.notify(tenantId, 'tenant.failed');
    await this.publishFailed({ tenantId, step, error });
    return true;
  }

  // Tells notification-service to email the company. Best effort: the row already says FAILED.
  private async publishFailed(payload: TenantFailedPayload): Promise<void> {
    try {
      await this.amqpConnection.publish(
        'provisioning.direct',
        'tenant.failed',
        payload,
        { timeout: PUBLISH_TIMEOUT_MS },
      );
    } catch (error) {
      this.logger.error(
        `Could not publish tenant.failed for tenant ${payload.tenantId}: ${errorMessage(error)}`,
      );
    }
  }

  // Records a finished step. Returns false, having changed nothing, when the tenant is no
  // longer live (a late result for a cancelled or removed tenant).
  private async completeStep(
    tenantId: string,
    step: ProvisioningStep,
    outcome: FinishedOutcome,
    extra: Prisma.TenantUpdateManyMutationInput = {},
  ): Promise<boolean> {
    const data: Prisma.TenantUpdateManyMutationInput = { ...extra };
    data[step] = outcome;
    const { count } = await this.prisma.tenant.updateMany({
      where: { id: tenantId, status: { in: LIVE } },
      data,
    });
    return count > 0;
  }

  // A step is done (its worker reported, the company called back, or it was skipped):
  // record it, log it and start the next one. The last step activates the tenant.
  private async finishStep(
    tenantId: string,
    step: ProvisioningStepName,
    outcome: FinishedOutcome,
    result: StepResult,
  ): Promise<boolean> {
    // The builtin welcome step activates through provisioning.complete instead.
    if (step === 'welcome') {
      const welcome = outcome === StepStatus.SKIPPED ? 'skipped' : 'custom';
      return this.activate(tenantId, outcome, { tenantId, welcome }, result);
    }
    const completed = await this.completeStep(
      tenantId,
      STEP_COLUMN[step],
      outcome,
      result.extra,
    );
    if (!completed) {
      this.ignoreStepResult(result.event, tenantId);
      return false;
    }
    await this.logEvent(tenantId, result.event, 'Success', result.payload);
    await this.advance(tenantId, step, result.input);
    return true;
  }

  // Starts the step after this one unless something already did (a replay, a late
  // duplicate), and sends it to whoever runs it.
  private async advance(
    tenantId: string,
    after: ProvisioningStepName,
    input?: object,
  ): Promise<void> {
    const next = nextStep(after);
    if (!next) {
      return;
    }
    const column = STEP_COLUMN[next];
    const where: Prisma.TenantWhereInput = { id: tenantId };
    where[column] = StepStatus.PENDING;
    const start: Prisma.TenantUpdateManyMutationInput = {};
    start[column] = StepStatus.IN_PROGRESS;
    const { count } = await this.prisma.tenant.updateMany({
      where,
      data: start,
    });
    if (count > 0) {
      await this.dispatch(tenantId, next, input);
    }
  }

  // Sends a step that was just marked IN_PROGRESS on its way, by the company's step
  // settings as they are now. False when it could not start; the step is then FAILED.
  private async dispatch(
    tenantId: string,
    step: ProvisioningStepName,
    input?: object,
  ): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { organisation: { select: { stepConfig: true } } },
    });
    if (!tenant) {
      this.logger.warn(
        `Cannot start ${step} for tenant ${tenantId}: it is gone`,
      );
      return false;
    }
    const { organisation, ...row } = tenant;
    return this.runStep(
      row,
      step,
      stepConfigFor(organisation?.stepConfig, step),
      input,
    );
  }

  private async runStep(
    tenant: Tenant,
    step: ProvisioningStepName,
    config: EffectiveStepConfigEntry,
    input?: object,
  ): Promise<boolean> {
    await this.recordStepMode(tenant, step, config.mode);
    if (config.mode === 'skipped') {
      await this.finishStep(tenant.id, step, StepStatus.SKIPPED, {
        event: 'tenant.step.skipped',
        payload: { step, reason: 'Skipped in your step settings' },
      });
      return true;
    }
    if (config.mode === 'custom') {
      return this.requestCustomStep(tenant, step, config);
    }
    const payload = input ?? rebuildInput(tenant, STEP_COLUMN[step]);
    // Only test tenants can be demo runs, so real ones never pay for the lookup.
    if (tenant.isTest && (await this.claimDemoFailure(tenant.id, step))) {
      return this.deadLetterOnPurpose(tenant.id, step, payload);
    }
    return this.publishBuiltinStep(tenant.id, step, payload);
  }

  // A demo run fails its chosen step once. The claim is atomic, so a replay or the Retry
  // that follows runs the step for real.
  private async claimDemoFailure(
    tenantId: string,
    step: ProvisioningStepName,
  ): Promise<boolean> {
    const { count } = await this.prisma.demoTenant.updateMany({
      where: { tenantId, failStep: step, failInjectedAt: null },
      data: { failInjectedAt: new Date() },
    });
    return count > 0;
  }

  // Published where a worker's rejected message would go, so the ordinary dead-letter
  // handler fails the step and the message is parked like any other.
  private async deadLetterOnPurpose(
    tenantId: string,
    step: ProvisioningStepName,
    payload: object,
  ): Promise<boolean> {
    const column = STEP_COLUMN[step];
    try {
      await this.amqpConnection.publish(
        DEAD_LETTER_EXCHANGE,
        DEAD_LETTER_KEY_BY_STEP[column],
        payload,
        {
          timeout: PUBLISH_TIMEOUT_MS,
          headers: { [DEMO_FAILURE_HEADER]: STEP_INPUT[column].queue },
        },
      );
      this.logger.log(
        `Demo tenant ${tenantId}: ${step} dead-lettered on purpose`,
      );
      return true;
    } catch (error) {
      await this.failStep(
        tenantId,
        column,
        `Could not dead-letter ${step} on purpose: ${errorMessage(error)}`,
      );
      return false;
    }
  }

  private async recordStepMode(
    tenant: Pick<Tenant, 'id' | 'stepModes'>,
    step: ProvisioningStepName,
    mode: StepMode,
  ): Promise<void> {
    const stepModes = { ...storedStepModes(tenant.stepModes), [step]: mode };
    await this.prisma.tenant.updateMany({
      where: { id: tenant.id },
      data: { stepModes },
    });
  }

  // Through the default exchange straight to the worker's queue: tenant-service decides
  // what runs next, so no worker listens to another's results.
  private async publishBuiltinStep(
    tenantId: string,
    step: ProvisioningStepName,
    payload: object,
  ): Promise<boolean> {
    const column = STEP_COLUMN[step];
    const { queue, routingKey } = STEP_INPUT[column];
    try {
      // Without a timeout a down broker buffers the publish and hangs the caller.
      await this.amqpConnection.publish('', queue, payload, {
        timeout: PUBLISH_TIMEOUT_MS,
      });
      return true;
    } catch (error) {
      await this.failStep(
        tenantId,
        column,
        `Could not publish ${routingKey}: ${errorMessage(error)}`,
      );
      return false;
    }
  }

  // The request is recorded before it is sent, so a callback that beats the response to
  // the POST still finds it. Delivery runs in the background; giving up fails the step.
  private async requestCustomStep(
    tenant: Pick<Tenant, 'id'>,
    step: ProvisioningStepName,
    config: EffectiveStepConfigEntry,
  ): Promise<boolean> {
    if (!config.url) {
      await this.failStep(
        tenant.id,
        STEP_COLUMN[step],
        `The ${step} step is set to custom but has no URL: set one under Settings → Provisioning`,
      );
      return false;
    }
    const call = await this.customSteps.open(tenant.id, step, 'provision', {
      url: config.url,
      timeoutMs: config.timeoutMs,
    });
    await this.logEvent(tenant.id, 'tenant.step.requested', 'Success', {
      step,
      requestId: call.id,
      url: call.url,
      deadline: call.deadlineAt.toISOString(),
    });
    this.dispatchCustomCall(call);
    return true;
  }

  // Sends a recorded request in the background. With workflowd the retries and the
  // deadline are durable; otherwise the retries live in this process.
  private dispatchCustomCall(call: CustomStepCall): void {
    if (!this.durable?.enabled) {
      this.sendCustomCallInBackground(call);
      return;
    }
    const input: CustomStepInput = {
      callId: call.id,
      deadline: call.deadlineAt.toISOString(),
      deliveryId: call.id,
    };
    void this.durable
      .start(CUSTOM_STEP_WORKFLOW, input, customStepWorkflowId(call.id))
      .then((started) =>
        started ? undefined : this.sendCustomCallInBackground(call),
      );
  }

  private sendCustomCallInBackground(call: CustomStepCall): void {
    void this.customSteps
      .send(call)
      .then((result) =>
        result.delivered || result.abandoned
          ? undefined
          : this.failCustomStep(
              call,
              undeliveredMessage(call, result.error ?? 'no answer'),
            ),
      )
      .catch((error: unknown) =>
        this.logger.error(
          `Custom ${call.step} ${call.action} for tenant ${call.tenantId} failed: ${errorMessage(error)}`,
        ),
      );
  }

  // Closes the request as FAILED and fails the step (or its teardown), unless a callback,
  // the deadline or a cancel closed it first.
  async failCustomStep(
    call: Pick<CustomStepCall, 'id' | 'tenantId' | 'step' | 'url' | 'action'>,
    error: string,
  ): Promise<boolean> {
    const closed = await this.customSteps.close(call.id, StepStatus.FAILED, {
      error,
    });
    if (!closed) {
      return false;
    }
    if (call.action === 'teardown') {
      await this.recordTeardown(
        call.tenantId,
        call.step as ProvisioningStepName,
        StepStatus.FAILED,
        { requestId: call.id, error },
      );
      return true;
    }
    return this.failStep(
      call.tenantId,
      STEP_COLUMN[call.step as ProvisioningStepName],
      error,
      { requestId: call.id, url: call.url },
    );
  }

  // The deadline passed without a callback.
  async timeOutCustomStep(call: CustomStepCall): Promise<boolean> {
    const minutes = Math.round(
      (call.deadlineAt.getTime() - call.createdAt.getTime()) / 60_000,
    );
    const within = `within ${minutes} minute${minutes === 1 ? '' : 's'}`;
    return this.failCustomStep(
      call,
      call.action === 'teardown'
        ? `Your system did not confirm the teardown ${within}`
        : `Your system did not call back ${within}`,
    );
  }

  // POST /tenants/:id/steps/:step[/teardown]/complete and /fail, from the company's
  // system. Idempotent: the same result twice is a duplicate, not an error.
  async customStepCallback(
    tenantId: string,
    organisationId: string,
    step: ProvisioningStepName,
    action: CustomStepAction,
    outcome: typeof StepStatus.SUCCESS | typeof StepStatus.FAILED,
    body: CompleteStepDto & FailStepDto,
  ): Promise<StepCallbackResult> {
    const teardown = action === 'teardown';
    for (let attempt = 0; ; attempt++) {
      const tenant = await this.findInOrganisation(tenantId, organisationId);
      const call = await this.customSteps.latest(tenantId, step, action);
      const answer = (
        result: StepCallbackResult['outcome'],
        reason?: string,
        status: string = tenant.status,
      ): StepCallbackResult => ({
        tenantId,
        step,
        action,
        outcome: result,
        status,
        ...(reason ? { reason } : {}),
      });

      if (!call) {
        throw new ConflictException(
          teardown
            ? `Liftoff is not waiting on your system to tear down the ${step} step of this customer`
            : `The ${step} step of this customer is not waiting on your system`,
        );
      }
      if (body.requestId && body.requestId !== call.id) {
        throw new ConflictException(
          `requestId ${body.requestId} is not the latest request for the ${step} step; that is ${call.id}`,
        );
      }
      const counts = teardown
        ? REMOVING.includes(tenant.status)
        : isLiveTenant(tenant.status);
      if (!counts) {
        return answer(
          'ignored',
          teardown
            ? 'The customer is not being removed, so this result changes nothing'
            : `The customer is ${tenant.status.toLowerCase()}, so this result changes nothing`,
        );
      }
      if (call.status === outcome) {
        return answer('duplicate');
      }
      if (call.status !== StepStatus.IN_PROGRESS) {
        const already =
          call.status === StepStatus.FAILED
            ? `already failed${call.error ? ` (${call.error})` : ''}`
            : call.status === StepStatus.SUCCESS
              ? 'is already done'
              : 'was cancelled';
        throw new ConflictException(
          teardown
            ? `The ${step} teardown ${already}. Remove the customer again to retry it.`
            : call.status === StepStatus.FAILED
              ? `The ${step} step ${already}. Retry the customer to request it again.`
              : `The ${step} step ${already}`,
        );
      }

      const reason =
        outcome === StepStatus.FAILED ? failureReason(body) : undefined;
      const closed = await this.customSteps.close(call.id, outcome, {
        error: reason,
        output: body.output as Prisma.InputJsonObject | undefined,
      });
      if (!closed) {
        // Another callback, the deadline or a cancel got there first: answer from what won.
        if (attempt === 0) {
          continue;
        }
        throw new ConflictException(
          `The ${step} step changed while your result came in. Read the customer and try again.`,
        );
      }

      const detail = {
        requestId: call.id,
        ...(body.output ? { output: body.output } : {}),
      };
      if (teardown) {
        await this.recordTeardown(tenantId, step, outcome, {
          ...detail,
          ...(reason ? { error: reason } : {}),
        });
      } else if (outcome === StepStatus.SUCCESS) {
        await this.finishStep(tenantId, step, StepStatus.SUCCESS, {
          event: 'tenant.step.completed',
          payload: { step, ...detail },
        });
      } else {
        await this.failStep(tenantId, STEP_COLUMN[step], reason!, {
          requestId: call.id,
          url: call.url,
        });
      }
      // The result is recorded; tell a durable wait it can stop waiting for it.
      void this.durable?.signal(
        customStepWorkflowId(call.id),
        CUSTOM_STEP_CALLBACK_SIGNAL,
        { outcome },
        `${call.id}:${outcome}`,
      );
      const after = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { status: true },
      });
      return answer('recorded', undefined, after?.status ?? tenant.status);
    }
  }

  // A worker that was mid-step when the tenant was cancelled or removed still reports in.
  private ignoreStepResult(event: string, tenantId: string): void {
    this.logger.debug(
      `${event} for tenant ${tenantId} ignored: tenant is cancelled, removed or being removed`,
    );
  }

  private async logEvent(
    tenantId: string,
    eventType: string,
    status: string,
    payload: object,
  ) {
    try {
      await this.prisma.eventLog.create({
        data: {
          tenantId,
          eventType,
          status,
          payload: payload as Prisma.InputJsonObject,
        },
      });
    } catch (e) {
      this.logger.error(`Failed to log event: ${errorMessage(e)}`);
    }
  }

  @RabbitSubscribe({
    exchange: 'provisioning.direct',
    routingKey: 'tenant.db.ready',
    queue: 'tenant-service-db-ready-queue',
    queueOptions: {
      durable: true,
    },
  })
  public async handleDbReady(payload: TenantDbReadyPayload) {
    this.logger.log(`DB ready for tenant ${payload.tenantId}`);
    try {
      await this.finishStep(payload.tenantId, 'database', StepStatus.SUCCESS, {
        event: 'tenant.db.ready',
        payload,
        input: payload,
      });
    } catch (error) {
      this.logger.error(
        `handleDbReady failed for tenant ${payload.tenantId}: ${errorMessage(error)}`,
      );
      throw error;
    }
  }

  @RabbitSubscribe({
    exchange: 'provisioning.direct',
    routingKey: 'tenant.dns.ready',
    queue: 'tenant-service-dns-ready-queue',
  })
  public async handleDnsReady(payload: TenantDnsReadyPayload) {
    await this.finishStep(payload.tenantId, 'address', StepStatus.SUCCESS, {
      event: 'tenant.dns.ready',
      payload,
      input: payload,
    });
  }

  @RabbitSubscribe({
    exchange: 'provisioning.direct',
    routingKey: 'tenant.credentials.ready',
    queue: 'tenant-service-credentials-ready-queue',
  })
  public async handleCredentialsReady(payload: TenantCredentialsReadyPayload) {
    await this.finishStep(payload.tenantId, 'credentials', StepStatus.SUCCESS, {
      event: 'tenant.credentials.ready',
      payload,
      input: payload,
    });
  }

  @RabbitSubscribe({
    exchange: 'provisioning.direct',
    routingKey: 'tenant.billing.active',
    queue: 'tenant-service-billing-active-queue',
  })
  public async handleBillingActive(payload: TenantBillingActivePayload) {
    // Billing is skipped, never simulated: a test tenant, or a company without Stripe.
    // The row says so and the saga moves on.
    const skipped = payload.skipped === true;
    await this.finishStep(
      payload.tenantId,
      'billing',
      skipped ? StepStatus.SKIPPED : StepStatus.SUCCESS,
      {
        event: skipped ? 'tenant.billing.skipped' : 'tenant.billing.active',
        payload,
        input: payload,
        extra: skipped
          ? {}
          : {
              stripeCustomerId: payload.stripeCustomerId,
              stripeSubscriptionId: payload.stripeSubscriptionId,
            },
      },
    );
  }

  @RabbitSubscribe({
    exchange: 'provisioning.direct',
    routingKey: 'tenant.provisioning.complete',
    queue: 'tenant-service-completion-queue',
    queueOptions: {
      durable: true,
    },
  })
  public async handleProvisioningComplete(
    payload: ProvisioningCompletePayload,
  ) {
    this.logger.log(`Activating tenant ${payload.tenantId}`);
    // notification-service says whether the company was emailed; nothing sent is SKIPPED.
    const emailed = payload.notification?.sent !== false;
    await this.activate(
      payload.tenantId,
      emailed ? StepStatus.SUCCESS : StepStatus.SKIPPED,
      payload,
    );
  }

  // The welcome step finished: the tenant is ACTIVE. FAILED stays eligible so a replayed
  // step can finish the saga; a cancelled, removed or removing tenant is never brought back.
  private async activate(
    tenantId: string,
    notificationStatus: FinishedOutcome,
    payload: object,
    stepResult?: StepResult,
  ): Promise<boolean> {
    try {
      const { count } = await this.prisma.tenant.updateMany({
        where: { id: tenantId, status: { in: SAGA_OPEN } },
        data: { status: TenantStatus.ACTIVE, notificationStatus },
      });
      if (count === 0) {
        this.logger.warn(
          `provisioning.complete for tenant ${tenantId} ignored: tenant is gone, cancelled or being removed`,
        );
        return false;
      }

      if (stepResult) {
        await this.logEvent(
          tenantId,
          stepResult.event,
          'Success',
          stepResult.payload,
        );
      }
      await this.logEvent(
        tenantId,
        'tenant.provisioning.complete',
        'Success',
        payload,
      );
      this.logger.log(`Tenant ${tenantId} is now ACTIVE`);
      this.webhooks.notify(tenantId, 'tenant.active');
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to activate tenant ${tenantId}: ${errorMessage(error)}`,
      );
      await this.logEvent(tenantId, 'tenant.provisioning.complete', 'Error', {
        error: errorMessage(error),
      });
      return false;
    }
  }

  @RabbitSubscribe({
    exchange: DEAD_LETTER_EXCHANGE,
    routingKey: DEAD_LETTER_ROUTING_KEYS,
    queue: 'tenant-service-dead-letter-queue',
    queueOptions: {
      durable: true,
    },
  })
  public async handleDeadLetter(
    payload: Partial<TenantRequestedPayload> | undefined,
    message: DeadLetterMessage,
  ) {
    const { routingKey } = message.fields;
    const step = STEP_BY_DEAD_LETTER_KEY[routingKey];
    const tenantId = payload?.tenantId;
    const teardown = TEARDOWN_BY_DEAD_LETTER_KEY[routingKey];
    if (teardown && tenantId) {
      await this.failTeardown(tenantId, teardown, message);
      return;
    }
    if (!step || !tenantId) {
      this.logger.warn(
        `Ignoring dead letter on ${routingKey}: no step or tenantId ${JSON.stringify(payload)}`,
      );
      return;
    }

    const failed = await this.failStep(
      tenantId,
      step,
      describeDeadLetter(message),
      { deadLetterKey: routingKey },
    );
    if (!failed) {
      this.logger.warn(
        `Dead letter ${routingKey} for tenant ${tenantId} ignored: tenant is gone, active or cancelled`,
      );
    }
  }

  async findAll(organisationId: string) {
    const [context, tenants] = await Promise.all([
      this.organisationContext(organisationId),
      this.prisma.tenant.findMany({
        // Removed customers leave the list; GET /tenants/:id still answers with DELETED.
        where: {
          ...inOrganisation(organisationId),
          status: { not: TenantStatus.DELETED },
        },
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return tenants.map((tenant) => this.present(tenant, context));
  }

  private async organisationContext(
    organisationId: string,
  ): Promise<OrgContext> {
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: organisationId },
      select: { baseDomain: true, plans: true },
    });
    return {
      baseDomain: organisation?.baseDomain ?? null,
      plans: effectivePlans(organisation?.plans),
    };
  }

  // Another company's tenant reads as missing, so its ids can't be probed.
  private async findInOrganisation(id: string, organisationId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, ...inOrganisation(organisationId) },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${id} not found`);
    }
    return tenant;
  }

  async findOne(id: string, organisationId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, ...inOrganisation(organisationId) },
      include: {
        plan: true,
        events: { orderBy: { timestamp: 'desc' }, take: 100 },
        organisation: { select: { baseDomain: true, plans: true } },
      },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${id} not found`);
    }
    const { organisation, ...row } = tenant;
    const customSteps: CustomStepView[] = await this.customSteps.forTenant(id);
    return {
      ...this.present(row, {
        baseDomain: organisation?.baseDomain ?? null,
        plans: effectivePlans(organisation?.plans),
      }),
      customSteps,
    };
  }

  async findEvents(id: string, organisationId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, ...inOrganisation(organisationId) },
      select: { events: { orderBy: { timestamp: 'desc' }, take: 200 } },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${id} not found`);
    }
    return tenant.events;
  }

  async findAllEvents(organisationId: string) {
    // Project tenant down to identifying fields only — avoid leaking
    // future-added sensitive columns (e.g. stripe IDs) and keep payload small.
    return this.prisma.eventLog.findMany({
      where: { tenant: inOrganisation(organisationId) },
      orderBy: { timestamp: 'desc' },
      take: 200,
      include: {
        tenant: {
          select: { id: true, name: true, subdomain: true },
        },
      },
    });
  }

  // From PROVISIONING this stops the saga (CANCELLED). From ACTIVE or FAILED the customer is
  // churning, so everything provisioned is torn down and the tenant ends DELETED.
  async cancel(id: string, organisationId: string, reason?: string) {
    const tenant = await this.findInOrganisation(id, organisationId);
    const cancelReason = reason || 'Cancelled by user';
    const result =
      tenant.status === TenantStatus.ACTIVE ||
      tenant.status === TenantStatus.FAILED
        ? await this.deprovision(tenant, cancelReason, true)
        : await this.cancelTenant(tenant, cancelReason);
    return this.present(result, await this.organisationContext(organisationId));
  }

  // The timeout sweeper acts for no user, so it looks the tenant up unscoped.
  async cancelStale(id: string, reason: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${id} not found`);
    }
    return this.cancelTenant(tenant, reason);
  }

  private async cancelTenant(tenant: Tenant, cancelReason: string) {
    const { id } = tenant;
    if (tenant.status !== TenantStatus.PROVISIONING) {
      throw new BadRequestException(
        `Cannot cancel tenant with status ${tenant.status}`,
      );
    }

    const updatedTenant = await this.prisma.tenant.update({
      where: { id },
      data: {
        status: TenantStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason,
        ...cancelOpenSteps(tenant),
      },
      include: { plan: true },
    });

    await this.customSteps.cancelOpen(
      id,
      'provision',
      'The customer was cancelled',
    );
    await this.logEvent(id, 'tenant.cancelled', 'Success', {
      reason: cancelReason,
    });

    // Publish cancellation event for other services to potentially clean up resources
    await this.amqpConnection.publish(
      'provisioning.direct',
      'tenant.cancelled',
      { tenantId: id, subdomain: tenant.subdomain, reason: cancelReason },
    );

    this.logger.log(`Tenant ${id} cancelled: ${cancelReason}`);
    return updatedTenant;
  }

  // Runs the failed step again, as the company's step settings say now: a builtin step's
  // input goes straight back to its worker's queue, a custom step is requested again, a
  // step switched to skipped is skipped. The tenant reads PROVISIONING meanwhile.
  async retry(id: string, organisationId: string) {
    const tenant = await this.findInOrganisation(id, organisationId);
    const column = PROVISIONING_STEPS.find(
      (s) => tenant[s] === StepStatus.FAILED,
    );
    if (tenant.status !== TenantStatus.FAILED || !column) {
      throw new BadRequestException(
        `Only a FAILED tenant can be retried; this one is ${tenant.status}`,
      );
    }
    const step = STEP_NAME[column];
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: organisationId },
      select: { stepConfig: true },
    });
    const config = stepConfigFor(organisation?.stepConfig, step);

    const where: Prisma.TenantWhereInput = {
      id,
      status: TenantStatus.FAILED,
    };
    where[column] = StepStatus.FAILED;
    const data: Prisma.TenantUpdateManyMutationInput = {
      status: TenantStatus.PROVISIONING,
    };
    data[column] = StepStatus.IN_PROGRESS;
    // A double click, or a retry racing a removal, starts it once.
    const { count } = await this.prisma.tenant.updateMany({ where, data });
    if (count === 0) {
      throw new ConflictException(
        'This tenant changed while you were retrying it. Refresh and try again.',
      );
    }

    if (config.mode === 'builtin') {
      await this.republishBuiltinStep(tenant, column);
    } else {
      await this.logEvent(id, 'tenant.retry', 'Success', {
        step: column,
        mode: config.mode,
      });
      const started = await this.runStep(tenant, step, config);
      if (!started) {
        throw new ServiceUnavailableException(
          'The retry could not be started. Try again in a moment.',
        );
      }
      this.logger.log(`Retrying tenant ${id} at ${column} (${config.mode})`);
    }
    return this.present(
      await this.reload(id),
      await this.organisationContext(organisationId),
    );
  }

  private async republishBuiltinStep(tenant: Tenant, step: ProvisioningStep) {
    const { id } = tenant;
    const input = STEP_INPUT[step];
    const { payload, source } = await this.retryInput(tenant, step);
    await this.recordStepMode(tenant, STEP_NAME[step], 'builtin');
    await this.logEvent(id, 'tenant.retry', 'Success', {
      step,
      queue: input.queue,
      routingKey: input.routingKey,
      source,
    });
    try {
      await this.amqpConnection.publish('', input.queue, payload, {
        timeout: PUBLISH_TIMEOUT_MS,
      });
    } catch (error) {
      await this.failStep(
        id,
        step,
        `Could not republish ${input.routingKey} to ${input.queue}: ${errorMessage(error)}`,
      );
      throw new ServiceUnavailableException(
        'The retry could not be queued. Try again in a moment.',
      );
    }
    this.logger.log(
      `Retrying tenant ${id} at ${step}: ${input.routingKey} → ${input.queue} (${source})`,
    );
  }

  // The payload the step originally received, from the event log; rebuilt from the
  // tenant row when it is not there (tenant.requested is never logged).
  private async retryInput(
    tenant: Tenant,
    step: ProvisioningStep,
  ): Promise<{ payload: object; source: 'event-log' | 'tenant' }> {
    const { events } = STEP_INPUT[step];
    if (events.length > 0) {
      const logged = await this.prisma.eventLog.findFirst({
        where: {
          tenantId: tenant.id,
          eventType: { in: events },
          status: 'Success',
        },
        orderBy: { timestamp: 'desc' },
        select: { payload: true },
      });
      const payload = storedInput(logged?.payload, tenant.id);
      if (payload) {
        return { payload, source: 'event-log' };
      }
    }
    return { payload: rebuildInput(tenant, step), source: 'tenant' };
  }

  async delete(id: string, organisationId: string) {
    const tenant = await this.findInOrganisation(id, organisationId);
    const removed = await this.deprovision(tenant, 'Deleted by user');
    return this.present(
      removed,
      await this.organisationContext(organisationId),
    );
  }

  // Starts (or resumes) the teardown saga. Safe to call again: a finished removal is
  // returned as it is, an unfinished one is published again for the parts still open.
  // A step that ran custom is torn down by the company's system (step.teardown); one that
  // was skipped has nothing to tear down.
  private async deprovision(
    tenant: Tenant,
    reason: string,
    cancelled = false,
  ): Promise<Tenant> {
    const { id } = tenant;
    const resuming =
      tenant.status === TenantStatus.DEPROVISIONING ||
      tenant.status === TenantStatus.DELETED;
    const customSteps = PROVISIONING_STEP_NAMES.filter(
      (step) => ranAs(tenant, step) === 'custom',
    );
    const customTeardowns = resuming
      ? await this.customSteps.teardownsToRetry(id, customSteps)
      : customSteps;
    if (
      tenant.status === TenantStatus.DELETED &&
      !teardownUnfinished(tenant) &&
      customTeardowns.length === 0
    ) {
      return this.reload(id);
    }

    const data: Prisma.TenantUpdateManyMutationInput = {};
    if (resuming) {
      // A teardown that dead-lettered or failed gets another go.
      for (const step of TEARDOWN_STEPS) {
        if (tenant[step] === StepStatus.FAILED || !tenant[step]) {
          data[step] = StepStatus.IN_PROGRESS;
        }
      }
    } else {
      const now = new Date();
      const teardownOf = (step: ProvisioningStepName) =>
        ranAs(tenant, step) === 'skipped'
          ? StepStatus.SKIPPED
          : StepStatus.IN_PROGRESS;
      const billingBuiltin = ranAs(tenant, 'billing') === 'builtin';
      // A test tenant is removed at once: it reads DELETED while the workers clean up.
      Object.assign(data, cancelOpenSteps(tenant), {
        status: tenant.isTest
          ? TenantStatus.DELETED
          : TenantStatus.DEPROVISIONING,
        ...(tenant.isTest ? { deletedAt: now } : {}),
        ...(cancelled ? { cancelledAt: now, cancelReason: reason } : {}),
        teardownDbStatus: teardownOf('database'),
        teardownCredentialsStatus: teardownOf('credentials'),
        teardownBillingStatus: !billingBuiltin
          ? teardownOf('billing')
          : tenant.stripeSubscriptionId && !tenant.isTest
            ? StepStatus.IN_PROGRESS
            : StepStatus.SKIPPED,
      });
    }

    // Only from the status we read, so two concurrent DELETEs start one teardown.
    const { count } = await this.prisma.tenant.updateMany({
      where: { id, status: tenant.status },
      data,
    });
    if (count === 0) {
      return this.reload(id);
    }
    if (!resuming) {
      await this.customSteps.cancelOpen(
        id,
        'provision',
        'The customer is being removed',
      );
    }

    const payload = await this.deprovisionPayload(tenant, reason);
    await this.logEvent(
      id,
      resuming ? 'tenant.deprovision.retried' : 'tenant.deprovision.requested',
      'Success',
      {
        reason,
        schema: payload.schemaName,
        subscription: payload.stripeSubscriptionId,
        test: tenant.isTest,
        ...(customTeardowns.length > 0 ? { customSteps: customTeardowns } : {}),
      },
    );
    if (!resuming && tenant.isTest) {
      await this.logEvent(id, 'tenant.deleted', 'Success', { reason });
      this.webhooks.notify(id, 'tenant.deleted');
    }

    // Before the broker publish, so a broker outage does not hold the company's back.
    for (const step of customTeardowns) {
      await this.requestTeardown(tenant, step);
    }

    try {
      await this.amqpConnection.publish(
        'provisioning.direct',
        'tenant.deprovision',
        payload,
        { timeout: PUBLISH_TIMEOUT_MS },
      );
    } catch (error) {
      this.logger.error(
        `Could not publish tenant.deprovision for tenant ${id}: ${errorMessage(error)}`,
      );
      throw new ServiceUnavailableException(
        'Removal started but could not be queued. Remove the customer again in a moment to retry.',
      );
    }
    this.logger.log(
      `Tenant ${id} (${tenant.subdomain}) ${resuming ? 'teardown retried' : 'deprovisioning'}: ${reason}`,
    );
    return this.reload(id);
  }

  // Workers tear down only what they made: no schema or subscription for a step that
  // ran custom or was skipped.
  private async deprovisionPayload(
    tenant: Tenant,
    reason: string,
  ): Promise<TenantDeprovisionPayload> {
    const subscription =
      tenant.isTest || ranAs(tenant, 'billing') !== 'builtin'
        ? null
        : tenant.stripeSubscriptionId;
    const base = {
      tenantId: tenant.id,
      subdomain: tenant.subdomain,
      stripeSubscriptionId: subscription,
      reason,
      ...(tenant.isTest ? { test: true } : {}),
    };
    if (ranAs(tenant, 'database') !== 'builtin') {
      return { ...base, schemaName: null };
    }
    const schema = tenant.schemaName ?? legacySchemaName(tenant.subdomain);
    // Schema names truncate the organisation handle, so two tenants can in theory share
    // one. Never drop a schema another tenant still uses.
    const sharers = await this.prisma.tenant.count({
      where: {
        id: { not: tenant.id },
        schemaName: schema,
        status: { not: TenantStatus.DELETED },
      },
    });
    if (sharers > 0) {
      this.logger.warn(
        `Not dropping schema ${schema} for tenant ${tenant.id}: ${sharers} other tenant(s) use it`,
      );
    }
    return { ...base, schemaName: sharers > 0 ? null : schema };
  }

  // step.teardown goes where the step is configured now, or else where it was run.
  private async requestTeardown(
    tenant: Pick<Tenant, 'id' | 'organisationId'>,
    step: ProvisioningStepName,
  ): Promise<void> {
    const organisation = tenant.organisationId
      ? await this.prisma.organisation.findUnique({
          where: { id: tenant.organisationId },
          select: { stepConfig: true },
        })
      : null;
    const config = stepConfigFor(organisation?.stepConfig, step);
    const url =
      (config.mode === 'custom' ? config.url : null) ??
      (await this.customSteps.latest(tenant.id, step, 'provision'))?.url;
    if (!url) {
      // No request ever reached the company for this step, so there is nothing to undo.
      await this.skipTeardown(tenant.id, step);
      return;
    }
    const call = await this.customSteps.open(tenant.id, step, 'teardown', {
      url,
      timeoutMs: config.timeoutMs,
    });
    await this.logEvent(
      tenant.id,
      'tenant.step.teardown.requested',
      'Success',
      {
        step,
        requestId: call.id,
        url: call.url,
        deadline: call.deadlineAt.toISOString(),
      },
    );
    this.dispatchCustomCall(call);
  }

  private async skipTeardown(
    tenantId: string,
    step: ProvisioningStepName,
  ): Promise<void> {
    const column = TEARDOWN_COLUMN[step];
    if (column) {
      const data: Prisma.TenantUpdateManyMutationInput = {};
      data[column] = StepStatus.SKIPPED;
      await this.prisma.tenant.updateMany({
        where: { id: tenantId, status: { in: REMOVING } },
        data,
      });
    }
    await this.logEvent(tenantId, 'tenant.step.teardown.skipped', 'Warning', {
      step,
      reason: 'No request was ever sent to your system for this step',
    });
  }

  // A custom teardown finished or failed. The step's teardown column (database,
  // credentials, billing) mirrors it, and the tenant is DELETED once nothing is left.
  private async recordTeardown(
    tenantId: string,
    step: ProvisioningStepName,
    outcome: typeof StepStatus.SUCCESS | typeof StepStatus.FAILED,
    detail: { requestId?: string; error?: string; output?: object },
  ): Promise<void> {
    const column = TEARDOWN_COLUMN[step];
    if (column) {
      const data: Prisma.TenantUpdateManyMutationInput = {};
      data[column] = outcome;
      await this.prisma.tenant.updateMany({
        where: { id: tenantId, status: { in: REMOVING } },
        data,
      });
    }
    if (outcome === StepStatus.SUCCESS) {
      await this.logEvent(tenantId, 'tenant.step.torn_down', 'Success', {
        step,
        ...detail,
      });
      await this.finishDeprovision(tenantId);
      return;
    }
    await this.logEvent(tenantId, 'tenant.deprovision.failed', 'Error', {
      part: step,
      ...detail,
    });
    this.logger.warn(
      `Custom teardown of ${step} failed for tenant ${tenantId}: ${detail.error}`,
    );
  }

  private async reload(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: { plan: true },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${id} not found`);
    }
    return tenant;
  }

  @RabbitSubscribe({
    exchange: 'provisioning.direct',
    routingKey: 'tenant.deprovision.done',
    queue: 'tenant-service-deprovision-done-queue',
    queueOptions: { durable: true },
  })
  public async handleDeprovisionDone(payload: TenantDeprovisionDonePayload) {
    const step = TEARDOWN_STEP_BY_PART[payload.part];
    if (!step || !payload.tenantId) {
      this.logger.warn(
        `Ignoring tenant.deprovision.done: ${JSON.stringify(payload)}`,
      );
      return;
    }
    if (!(await this.partRanBuiltin(payload.tenantId, payload.part))) {
      return;
    }
    const data: Prisma.TenantUpdateManyMutationInput = {};
    data[step] = payload.skipped ? StepStatus.SKIPPED : StepStatus.SUCCESS;
    const { count } = await this.prisma.tenant.updateMany({
      where: {
        id: payload.tenantId,
        status: {
          in: [TenantStatus.DEPROVISIONING, TenantStatus.DELETED],
        },
      },
      data,
    });
    if (count === 0) {
      this.logger.warn(
        `Teardown ${payload.part} for tenant ${payload.tenantId} ignored: tenant is gone or not being removed`,
      );
      return;
    }
    await this.logEvent(
      payload.tenantId,
      TEARDOWN_EVENT[payload.part],
      'Success',
      payload,
    );
    if (payload.warning) {
      await this.logEvent(
        payload.tenantId,
        `${TEARDOWN_EVENT[payload.part]}.warning`,
        'Warning',
        { part: payload.part, warning: payload.warning },
      );
    }
    await this.finishDeprovision(payload.tenantId);
  }

  // The worker's result for a part counts only when that step ran builtin; otherwise the
  // company's teardown (or nothing, for a skipped step) is what the column shows.
  private async partRanBuiltin(
    tenantId: string,
    part: DeprovisionPart,
  ): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { stepModes: true },
    });
    if (tenant && ranAs(tenant, STEP_FOR_PART[part]) !== 'builtin') {
      this.logger.debug(
        `Teardown ${part} result for tenant ${tenantId} ignored: that step did not run builtin`,
      );
      return false;
    }
    return true;
  }

  // Whichever result lands last moves the tenant to DELETED; the where clause makes it once.
  private async finishDeprovision(tenantId: string) {
    const finished = { in: TEARDOWN_FINISHED };
    const { count } = await this.prisma.tenant.updateMany({
      where: {
        id: tenantId,
        status: TenantStatus.DEPROVISIONING,
        teardownDbStatus: finished,
        teardownCredentialsStatus: finished,
        teardownBillingStatus: finished,
        // Address and welcome have no column: their custom teardowns must be done too.
        customStepCalls: {
          none: {
            action: 'teardown',
            status: { in: [StepStatus.IN_PROGRESS, StepStatus.FAILED] },
          },
        },
      },
      data: { status: TenantStatus.DELETED, deletedAt: new Date(), live: null },
    });
    if (count > 0) {
      await this.logEvent(tenantId, 'tenant.deleted', 'Success', {});
      this.logger.log(`Tenant ${tenantId} is DELETED`);
      this.webhooks.notify(tenantId, 'tenant.deleted');
    }
    // A test tenant read DELETED at once; it gives its name back once its schema is gone,
    // so a new tenant with the same subdomain never gets a schema that is being dropped.
    await this.prisma.tenant.updateMany({
      where: {
        id: tenantId,
        status: TenantStatus.DELETED,
        live: true,
        teardownDbStatus: finished,
      },
      data: { live: null },
    });
  }

  private async failTeardown(
    tenantId: string,
    part: TenantDeprovisionDonePayload['part'],
    message: DeadLetterMessage,
  ) {
    if (!(await this.partRanBuiltin(tenantId, part))) {
      return;
    }
    const data: Prisma.TenantUpdateManyMutationInput = {};
    data[TEARDOWN_STEP_BY_PART[part]] = StepStatus.FAILED;
    const { count } = await this.prisma.tenant.updateMany({
      where: {
        id: tenantId,
        status: {
          in: [TenantStatus.DEPROVISIONING, TenantStatus.DELETED],
        },
      },
      data,
    });
    if (count === 0) {
      this.logger.warn(
        `Teardown dead letter for tenant ${tenantId} ignored: tenant is gone or not being removed`,
      );
      return;
    }
    const error = describeDeadLetter(message);
    await this.logEvent(tenantId, 'tenant.deprovision.failed', 'Error', {
      part,
      error,
      deadLetterKey: message.fields.routingKey,
    });
    this.logger.warn(
      `Teardown ${part} failed for tenant ${tenantId}: ${error}`,
    );
  }
}

const failureReason = (body: FailStepDto): string =>
  body.error?.trim() || 'Your system reported that the step failed';

// Why a request the company's system never took fails its step (or its teardown).
function undeliveredMessage(
  call: Pick<CustomStepCall, 'step' | 'action'>,
  error: string,
): string {
  const what = call.action === 'teardown' ? 'teardown' : 'request';
  return `Your system did not take the ${call.step} ${what}: ${error}`;
}
