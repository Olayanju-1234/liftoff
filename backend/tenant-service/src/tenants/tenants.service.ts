import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
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
import type {
  ProvisioningCompletePayload,
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
  describeDeadLetter,
  type DeadLetterMessage,
  type ProvisioningStep,
} from './dead-letters';
import { WebhookService } from '../webhooks/webhook.service';
import { schemaNameFor, withAddress } from './address';
import { QuotasService } from './quotas.service';

const PUBLISH_TIMEOUT_MS = 5_000;

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
  ) {}

  async create(createTenantDto: CreateTenantDto, creator: TenantCreator) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: creator.organisationId },
      select: { handle: true, baseDomain: true },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    await this.quotas.assertCanProvision(creator.organisationId);

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
      const tenant = await this.prisma.tenant.create({
        data: {
          name: createTenantDto.name,
          subdomain: createTenantDto.subdomain,
          schemaName: schemaNameFor(
            organisation.handle,
            createTenantDto.subdomain,
          ),
          planId: plan.id,
          organisationId: creator.organisationId,
          ownerId: creator.ownerId,
          dbStatus: StepStatus.IN_PROGRESS, // Start first step
        },
      });

      await this.quotas.record(creator.organisationId, tenant.id);
      await this.startProvisioning(tenant);

      return withAddress(tenant, organisation.baseDomain);
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
    tenant: Pick<Tenant, 'id' | 'name' | 'subdomain' | 'planId' | 'schemaName'>,
  ) {
    await this.logEvent(tenant.id, 'tenant.created', 'Success', {
      name: tenant.name,
      plan: tenant.planId,
      schema: tenant.schemaName,
    });

    const eventPayload: TenantRequestedPayload = {
      tenantId: tenant.id,
      subdomain: tenant.subdomain,
      planId: tenant.planId,
      ...(tenant.schemaName ? { schemaName: tenant.schemaName } : {}),
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

    // FAILED stays eligible so a replayed message that fails again is recorded.
    const { count } = await this.prisma.tenant.updateMany({
      where: {
        id: tenantId,
        status: { in: [TenantStatus.PROVISIONING, TenantStatus.FAILED] },
      },
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
    return true;
  }

  // Each worker consumes the same event in parallel with this service, so the
  // next step may already be SUCCESS or FAILED; only start it while PENDING.
  private async completeStep(
    tenantId: string,
    step: ProvisioningStep,
    next: ProvisioningStep,
  ) {
    const data: Prisma.TenantUpdateInput = {};
    data[step] = StepStatus.SUCCESS;
    await this.prisma.tenant.update({ where: { id: tenantId }, data });

    const where: Prisma.TenantWhereInput = { id: tenantId };
    where[next] = StepStatus.PENDING;
    const start: Prisma.TenantUpdateManyMutationInput = {};
    start[next] = StepStatus.IN_PROGRESS;
    await this.prisma.tenant.updateMany({ where, data: start });
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
      await this.completeStep(payload.tenantId, 'dbStatus', 'dnsStatus');
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
    await this.completeStep(payload.tenantId, 'dnsStatus', 'credentialsStatus');
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
    await this.completeStep(
      payload.tenantId,
      'credentialsStatus',
      'billingStatus',
    );
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
    await this.completeStep(
      payload.tenantId,
      'billingStatus',
      'notificationStatus',
    );
    await this.logEvent(
      payload.tenantId,
      'tenant.billing.active',
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

    try {
      await this.prisma.tenant.update({
        where: {
          id: payload.tenantId,
        },
        data: {
          status: TenantStatus.ACTIVE,
          notificationStatus: StepStatus.SUCCESS,
        },
      });

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
        where: inOrganisation(organisationId),
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return tenants.map((tenant) => withAddress(tenant, baseDomain));
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
    return withAddress(row, organisation?.baseDomain);
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

  async cancel(id: string, organisationId: string, reason?: string) {
    const cancelled = await this.cancelTenant(
      await this.findInOrganisation(id, organisationId),
      reason || 'Cancelled by user',
    );
    return withAddress(cancelled, await this.baseDomainOf(organisationId));
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

    // Update tenant status and all pending/in-progress steps to CANCELLED
    const updatedTenant = await this.prisma.tenant.update({
      where: { id },
      data: {
        status: TenantStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason,
        dbStatus:
          tenant.dbStatus === StepStatus.PENDING ||
          tenant.dbStatus === StepStatus.IN_PROGRESS
            ? StepStatus.CANCELLED
            : tenant.dbStatus,
        dnsStatus:
          tenant.dnsStatus === StepStatus.PENDING ||
          tenant.dnsStatus === StepStatus.IN_PROGRESS
            ? StepStatus.CANCELLED
            : tenant.dnsStatus,
        credentialsStatus:
          tenant.credentialsStatus === StepStatus.PENDING ||
          tenant.credentialsStatus === StepStatus.IN_PROGRESS
            ? StepStatus.CANCELLED
            : tenant.credentialsStatus,
        billingStatus:
          tenant.billingStatus === StepStatus.PENDING ||
          tenant.billingStatus === StepStatus.IN_PROGRESS
            ? StepStatus.CANCELLED
            : tenant.billingStatus,
        notificationStatus:
          tenant.notificationStatus === StepStatus.PENDING ||
          tenant.notificationStatus === StepStatus.IN_PROGRESS
            ? StepStatus.CANCELLED
            : tenant.notificationStatus,
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

  async delete(id: string, organisationId: string) {
    const tenant = await this.findInOrganisation(id, organisationId);

    // Publish deletion event for other services to clean up resources (schemas, DNS, credentials, etc.)
    await this.amqpConnection.publish('provisioning.direct', 'tenant.deleted', {
      tenantId: id,
      subdomain: tenant.subdomain,
      schemaName: tenant.schemaName,
    });

    await this.logEvent(id, 'tenant.deleted', 'Success', {
      subdomain: tenant.subdomain,
      schema: tenant.schemaName,
    });

    // Events are cascade deleted due to Prisma schema onDelete: Cascade
    const deletedTenant = await this.prisma.tenant.delete({
      where: { id },
    });

    this.logger.log(`Tenant ${id} (${tenant.subdomain}) deleted`);
    return withAddress(deletedTenant, await this.baseDomainOf(organisationId));
  }
}
