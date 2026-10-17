import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
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
  type Tenant,
} from '.prisma/tenant-client';
import {
  LIVE_TENANT_STATUSES,
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
  DEAD_LETTER_ROUTING_KEYS,
  STEP_BY_DEAD_LETTER_KEY,
  TEARDOWN_BY_DEAD_LETTER_KEY,
  TEARDOWN_STEP_BY_PART,
  describeDeadLetter,
  type DeadLetterMessage,
  type ProvisioningStep,
  type TeardownStep,
} from './dead-letters';
import { WebhookService } from '../webhooks/webhook.service';
import { legacySchemaName, schemaNameFor, withAddress } from './address';
import { STEP_INPUT, rebuildInput, storedInput } from './retry';
import { QuotasService } from './quotas.service';
import { StatusTokenService } from '../status/status-token.service';
import { newTenantId } from './ids';

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

// Who a tenant is created for: the company, and the user who clicked (none for an API key).
export interface TenantCreator {
  organisationId: string;
  ownerId: string | null;
}

// Tenants are the company's customers; its own legacy workspace tenant is not one.
const inOrganisation = (
  organisationId: string,
): Pick<Prisma.TenantWhereInput, 'organisationId' | 'isWorkspace'> => ({
  organisationId,
  isWorkspace: false,
});

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private prisma: PrismaService,
    private readonly amqpConnection: AmqpConnection,
    private readonly webhooks: WebhookService,
    private readonly quotas: QuotasService,
    private readonly statusTokens: StatusTokenService,
  ) {}

  // Every tenant the API returns carries its address and its public status page.
  private present<T extends { id: string; subdomain: string }>(
    tenant: T,
    baseDomain: string | null | undefined,
  ) {
    return {
      ...withAddress(tenant, baseDomain),
      statusUrl: this.statusTokens.urlFor(tenant.id),
    };
  }

  async create(createTenantDto: CreateTenantDto, creator: TenantCreator) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: creator.organisationId },
      select: { handle: true, baseDomain: true },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    const isTest = createTenantDto.test === true;
    if (!isTest) {
      await this.quotas.assertCanProvision(creator.organisationId);
    }

    // Get or create plan - check by both id and name to avoid unique constraint issues
    let plan = await this.prisma.plan.findFirst({
      where: {
        OR: [{ id: createTenantDto.planId }, { name: createTenantDto.planId }],
      },
    });

    if (!plan) {
      plan = await this.prisma.plan.create({
        data: {
          id: createTenantDto.planId,
          name: createTenantDto.planId,
          maxUsers: 5,
          maxApiKeys: 3,
        },
      });
    }

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
        },
      });

      if (!isTest) {
        await this.quotas.record(creator.organisationId, tenant.id);
      }
      await this.startProvisioning(tenant);

      return this.present(tenant, organisation.baseDomain);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
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

  // Callers create the tenant with dbStatus IN_PROGRESS first.
  async startProvisioning(
    tenant: Pick<
      Tenant,
      'id' | 'name' | 'subdomain' | 'planId' | 'schemaName' | 'isTest'
    >,
  ) {
    await this.logEvent(tenant.id, 'tenant.created', 'Success', {
      name: tenant.name,
      plan: tenant.planId,
      schema: tenant.schemaName,
      test: tenant.isTest,
    });

    const eventPayload: TenantRequestedPayload = {
      tenantId: tenant.id,
      subdomain: tenant.subdomain,
      planId: tenant.planId,
      ...(tenant.schemaName ? { schemaName: tenant.schemaName } : {}),
      ...(tenant.isTest ? { test: true } : {}),
    };

    try {
      // Without a timeout a down broker buffers the publish and hangs the request.
      await this.amqpConnection.publish(
        'provisioning.direct',
        'tenant.requested',
        eventPayload,
        { timeout: PUBLISH_TIMEOUT_MS },
      );
    } catch (error) {
      await this.failStep(
        tenant.id,
        'dbStatus',
        `Could not publish tenant.requested: ${errorMessage(error)}`,
      );
      throw error;
    }
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

  // Each worker consumes the same event in parallel with this service, so the
  // next step may already be SUCCESS or FAILED; only start it while PENDING.
  // Returns false, having changed nothing, when the tenant is no longer live.
  private async completeStep(
    tenantId: string,
    step: ProvisioningStep,
    next: ProvisioningStep,
    outcome:
      | typeof StepStatus.SUCCESS
      | typeof StepStatus.SKIPPED = StepStatus.SUCCESS,
    extra: Prisma.TenantUpdateManyMutationInput = {},
  ): Promise<boolean> {
    const data: Prisma.TenantUpdateManyMutationInput = { ...extra };
    data[step] = outcome;
    const { count } = await this.prisma.tenant.updateMany({
      where: { id: tenantId, status: { in: LIVE } },
      data,
    });
    if (count === 0) {
      return false;
    }

    const where: Prisma.TenantWhereInput = { id: tenantId };
    where[next] = StepStatus.PENDING;
    const start: Prisma.TenantUpdateManyMutationInput = {};
    start[next] = StepStatus.IN_PROGRESS;
    await this.prisma.tenant.updateMany({ where, data: start });
    return true;
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
      const completed = await this.completeStep(
        payload.tenantId,
        'dbStatus',
        'dnsStatus',
      );
      if (!completed) {
        this.ignoreStepResult('tenant.db.ready', payload.tenantId);
        return;
      }
      await this.logEvent(
        payload.tenantId,
        'tenant.db.ready',
        'Success',
        payload,
      );
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
    const completed = await this.completeStep(
      payload.tenantId,
      'dnsStatus',
      'credentialsStatus',
    );
    if (!completed) {
      this.ignoreStepResult('tenant.dns.ready', payload.tenantId);
      return;
    }
    await this.logEvent(
      payload.tenantId,
      'tenant.dns.ready',
      'Success',
      payload,
    );
  }

  @RabbitSubscribe({
    exchange: 'provisioning.direct',
    routingKey: 'tenant.credentials.ready',
    queue: 'tenant-service-credentials-ready-queue',
  })
  public async handleCredentialsReady(payload: TenantCredentialsReadyPayload) {
    const completed = await this.completeStep(
      payload.tenantId,
      'credentialsStatus',
      'billingStatus',
    );
    if (!completed) {
      this.ignoreStepResult('tenant.credentials.ready', payload.tenantId);
      return;
    }
    await this.logEvent(
      payload.tenantId,
      'tenant.credentials.ready',
      'Success',
      payload,
    );
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
    const completed = await this.completeStep(
      payload.tenantId,
      'billingStatus',
      'notificationStatus',
      skipped ? StepStatus.SKIPPED : StepStatus.SUCCESS,
      skipped
        ? {}
        : {
            stripeCustomerId: payload.stripeCustomerId,
            stripeSubscriptionId: payload.stripeSubscriptionId,
          },
    );
    if (!completed) {
      this.ignoreStepResult('tenant.billing.active', payload.tenantId);
      return;
    }
    await this.logEvent(
      payload.tenantId,
      skipped ? 'tenant.billing.skipped' : 'tenant.billing.active',
      'Success',
      payload,
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
    try {
      // FAILED stays eligible so a replayed step can finish the saga. A cancelled, removed
      // or removing tenant is never brought back by a late message.
      const { count } = await this.prisma.tenant.updateMany({
        where: { id: payload.tenantId, status: { in: SAGA_OPEN } },
        data: {
          status: TenantStatus.ACTIVE,
          notificationStatus: emailed ? StepStatus.SUCCESS : StepStatus.SKIPPED,
        },
      });
      if (count === 0) {
        this.logger.warn(
          `provisioning.complete for tenant ${payload.tenantId} ignored: tenant is gone, cancelled or being removed`,
        );
        return;
      }

      await this.logEvent(
        payload.tenantId,
        'tenant.provisioning.complete',
        'Success',
        payload,
      );
      this.logger.log(`Tenant ${payload.tenantId} is now ACTIVE`);
      this.webhooks.notify(payload.tenantId, 'tenant.active');
    } catch (error) {
      this.logger.error(
        `Failed to activate tenant ${payload.tenantId}: ${errorMessage(error)}`,
      );
      await this.logEvent(
        payload.tenantId,
        'tenant.provisioning.complete',
        'Error',
        { error: errorMessage(error) },
      );
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
    const [baseDomain, tenants] = await Promise.all([
      this.baseDomainOf(organisationId),
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
    return tenants.map((tenant) => this.present(tenant, baseDomain));
  }

  private async baseDomainOf(organisationId: string): Promise<string | null> {
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: organisationId },
      select: { baseDomain: true },
    });
    return organisation?.baseDomain ?? null;
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
        organisation: { select: { baseDomain: true } },
      },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${id} not found`);
    }
    const { organisation, ...row } = tenant;
    return this.present(row, organisation?.baseDomain);
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
    return this.present(result, await this.baseDomainOf(organisationId));
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

  // Runs the failed step again: its input message goes straight back to that worker's
  // queue, and the tenant reads PROVISIONING with the step IN_PROGRESS until it answers.
  async retry(id: string, organisationId: string) {
    const tenant = await this.findInOrganisation(id, organisationId);
    const step = PROVISIONING_STEPS.find(
      (s) => tenant[s] === StepStatus.FAILED,
    );
    if (tenant.status !== TenantStatus.FAILED || !step) {
      throw new BadRequestException(
        `Only a FAILED tenant can be retried; this one is ${tenant.status}`,
      );
    }

    const input = STEP_INPUT[step];
    const { payload, source } = await this.retryInput(tenant, step);

    const where: Prisma.TenantWhereInput = {
      id,
      status: TenantStatus.FAILED,
    };
    where[step] = StepStatus.FAILED;
    const data: Prisma.TenantUpdateManyMutationInput = {
      status: TenantStatus.PROVISIONING,
    };
    data[step] = StepStatus.IN_PROGRESS;
    // A double click, or a retry racing a removal, publishes once.
    const { count } = await this.prisma.tenant.updateMany({ where, data });
    if (count === 0) {
      throw new ConflictException(
        'This tenant changed while you were retrying it. Refresh and try again.',
      );
    }

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
    return this.present(
      await this.reload(id),
      await this.baseDomainOf(organisationId),
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
    return this.present(removed, await this.baseDomainOf(organisationId));
  }

  // Starts (or resumes) the teardown saga. Safe to call again: a finished removal is
  // returned as it is, an unfinished one is published again for the parts still open.
  private async deprovision(
    tenant: Tenant,
    reason: string,
    cancelled = false,
  ): Promise<Tenant> {
    const { id } = tenant;
    const resuming =
      tenant.status === TenantStatus.DEPROVISIONING ||
      tenant.status === TenantStatus.DELETED;
    if (tenant.status === TenantStatus.DELETED && !teardownUnfinished(tenant)) {
      return this.reload(id);
    }

    const data: Prisma.TenantUpdateManyMutationInput = {};
    if (resuming) {
      // A teardown that dead-lettered gets another go.
      for (const step of TEARDOWN_STEPS) {
        if (tenant[step] === StepStatus.FAILED || !tenant[step]) {
          data[step] = StepStatus.IN_PROGRESS;
        }
      }
    } else {
      const now = new Date();
      // A test tenant is removed at once: it reads DELETED while the workers clean up.
      Object.assign(data, cancelOpenSteps(tenant), {
        status: tenant.isTest
          ? TenantStatus.DELETED
          : TenantStatus.DEPROVISIONING,
        ...(tenant.isTest ? { deletedAt: now } : {}),
        ...(cancelled ? { cancelledAt: now, cancelReason: reason } : {}),
        teardownDbStatus: StepStatus.IN_PROGRESS,
        teardownCredentialsStatus: StepStatus.IN_PROGRESS,
        teardownBillingStatus:
          tenant.stripeSubscriptionId && !tenant.isTest
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
      },
    );
    if (!resuming && tenant.isTest) {
      await this.logEvent(id, 'tenant.deleted', 'Success', { reason });
      this.webhooks.notify(id, 'tenant.deleted');
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

  private async deprovisionPayload(
    tenant: Tenant,
    reason: string,
  ): Promise<TenantDeprovisionPayload> {
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
    return {
      tenantId: tenant.id,
      subdomain: tenant.subdomain,
      schemaName: sharers > 0 ? null : schema,
      stripeSubscriptionId: tenant.isTest ? null : tenant.stripeSubscriptionId,
      reason,
      ...(tenant.isTest ? { test: true } : {}),
    };
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
