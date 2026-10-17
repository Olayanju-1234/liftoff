import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import {
  CompleteStepDto,
  FailStepDto,
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENT_REPLAYED_HEADER,
  type ProvisioningStepName,
} from '@liftoff/shared-types';
import { StepStatus } from '.prisma/tenant-client';
import { ParseCuidPipe } from '../common/parse-cuid.pipe';
import { ParseStepNamePipe } from '../common/parse-step-name.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentOrganisation } from '../auth/decorators/current-organisation.decorator';
import { AllowApiKey } from '../auth/decorators/allow-api-key.decorator';
import { TenantsService } from './tenants.service';
import { IdempotencyService } from './idempotency.service';
import { QuotaExceededException } from './quotas.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { CancelTenantDto } from './dto/cancel-tenant.dto';

@ApiTags('Tenants')
@ApiBearerAuth('bearer')
@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  @AllowApiKey()
  @ApiSecurity('api-key')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Create a customer tenant and emit tenant.requested',
    description:
      'Accepts a user token or a company API key. Send an Idempotency-Key to make retries safe: the first response for a key is stored for 24 h per organisation and replayed on a repeat, with Idempotent-Replayed: true.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: `Any string up to ${IDEMPOTENCY_KEY_MAX_LENGTH} characters, unique per request (a UUID works).`,
  })
  @ApiResponse({ status: 202, description: 'Tenant accepted, or replayed' })
  @ApiResponse({
    status: 409,
    description:
      'Name or subdomain taken, or the first request with this Idempotency-Key is still running',
  })
  @ApiResponse({
    status: 422,
    description: 'Idempotency-Key reused with a different body',
  })
  @ApiResponse({
    status: 429,
    description:
      'The organisation is at its active-tenant or daily provisioning limit; Retry-After says how long to wait',
  })
  async create(
    @Body() createTenantDto: CreateTenantDto,
    @CurrentOrganisation() organisationId: string,
    @CurrentUser('id') userId: string | undefined,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const creator = { organisationId, ownerId: userId ?? null };
    const key = idempotencyKey?.trim();
    try {
      if (!key) {
        return await this.tenantsService.create(createTenantDto, creator);
      }
      const { body, replayed } = await this.idempotency.run(
        organisationId,
        key,
        createTenantDto,
        () => this.tenantsService.create(createTenantDto, creator),
      );
      if (replayed) {
        void reply.header(IDEMPOTENT_REPLAYED_HEADER, 'true');
      }
      return body;
    } catch (error) {
      // Headers set here survive the exception filter's reply.
      if (error instanceof QuotaExceededException) {
        void reply.header('Retry-After', String(error.retryAfterSeconds));
      }
      throw error;
    }
  }

  @Get()
  @ApiOperation({ summary: "List the company's tenants" })
  findAll(@CurrentOrganisation() organisationId: string) {
    return this.tenantsService.findAll(organisationId);
  }

  @Get('events')
  @ApiOperation({
    summary: "Event log across the company's tenants (most recent 200)",
  })
  findAllEvents(@CurrentOrganisation() organisationId: string) {
    return this.tenantsService.findAllEvents(organisationId);
  }

  @Get(':id')
  @AllowApiKey()
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'Get tenant with plan and last 100 events',
    description: 'Accepts a user token or a company API key.',
  })
  findOne(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentOrganisation() organisationId: string,
  ) {
    return this.tenantsService.findOne(id, organisationId);
  }

  @Get(':id/events')
  @ApiOperation({ summary: 'Event log for a single tenant (most recent 200)' })
  findEvents(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentOrganisation() organisationId: string,
  ) {
    return this.tenantsService.findEvents(id, organisationId);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a tenant',
    description:
      'From PROVISIONING: stops the pipeline (CANCELLED); finished steps are kept. From ACTIVE or FAILED: deprovisions it like DELETE, recording the reason.',
  })
  @ApiResponse({
    status: 400,
    description: 'Tenant is CANCELLED, being removed or removed',
  })
  cancel(
    @Param('id', ParseCuidPipe) id: string,
    @Body() cancelDto: CancelTenantDto,
    @CurrentOrganisation() organisationId: string,
  ) {
    return this.tenantsService.cancel(id, organisationId, cancelDto.reason);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run the failed step of a FAILED tenant again',
    description:
      "Runs the failed step again by the step settings as they are now: a builtin step's input message goes back to that worker's queue (from the event log, or rebuilt from the tenant), a custom step gets a new step.requested with a new requestId, a step switched to skipped is skipped. Answers with the tenant PROVISIONING. Finished steps are kept. If it fails again the tenant is FAILED again, with a new event.",
  })
  @ApiResponse({ status: 400, description: 'The tenant is not FAILED' })
  @ApiResponse({
    status: 409,
    description: 'The tenant changed meanwhile (a second retry, a removal)',
  })
  retry(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentOrganisation() organisationId: string,
  ) {
    return this.tenantsService.retry(id, organisationId);
  }

  @Post(':id/steps/:step/complete')
  @AllowApiKey()
  @ApiSecurity('api-key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Your system finished a custom step',
    description:
      'The callback for step.requested, with a company API key. Records the step SUCCESS and starts the next one. Idempotent: the same result again answers outcome "duplicate"; for a cancelled or removed customer it answers outcome "ignored" and changes nothing.',
  })
  @ApiResponse({ status: 200, description: 'Recorded, duplicate or ignored' })
  @ApiResponse({ status: 400, description: 'Unknown step or invalid body' })
  @ApiResponse({
    status: 409,
    description:
      'The step is not waiting on your system, already failed or timed out, or requestId is not the latest request',
  })
  completeStep(
    @Param('id', ParseCuidPipe) id: string,
    @Param('step', ParseStepNamePipe) step: ProvisioningStepName,
    @Body() dto: CompleteStepDto,
    @CurrentOrganisation() organisationId: string,
  ) {
    return this.tenantsService.customStepCallback(
      id,
      organisationId,
      step,
      'provision',
      StepStatus.SUCCESS,
      dto,
    );
  }

  @Post(':id/steps/:step/fail')
  @AllowApiKey()
  @ApiSecurity('api-key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Your system could not do a custom step',
    description:
      'The callback for step.requested, with a company API key. Fails the step and the customer with your error (tenant.failed webhook, failure email); Retry requests the step again. Idempotent like /complete.',
  })
  @ApiResponse({ status: 200, description: 'Recorded, duplicate or ignored' })
  @ApiResponse({ status: 400, description: 'Unknown step or invalid body' })
  @ApiResponse({
    status: 409,
    description:
      'The step is not waiting on your system, already finished, or requestId is not the latest request',
  })
  failStep(
    @Param('id', ParseCuidPipe) id: string,
    @Param('step', ParseStepNamePipe) step: ProvisioningStepName,
    @Body() dto: FailStepDto,
    @CurrentOrganisation() organisationId: string,
  ) {
    return this.tenantsService.customStepCallback(
      id,
      organisationId,
      step,
      'provision',
      StepStatus.FAILED,
      dto,
    );
  }

  @Post(':id/steps/:step/teardown/complete')
  @AllowApiKey()
  @ApiSecurity('api-key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Your system tore down what a custom step made',
    description:
      'The callback for a step.teardown delivery, sent when a customer whose step ran custom is removed. The removal finishes (DELETED, tenant.deleted webhook) once every part is torn down. Idempotent like the step callbacks.',
  })
  @ApiResponse({ status: 200, description: 'Recorded, duplicate or ignored' })
  @ApiResponse({
    status: 409,
    description:
      'No teardown is waiting on your system for this step, it already failed or timed out (remove the customer again), or requestId is not the latest',
  })
  completeTeardown(
    @Param('id', ParseCuidPipe) id: string,
    @Param('step', ParseStepNamePipe) step: ProvisioningStepName,
    @Body() dto: CompleteStepDto,
    @CurrentOrganisation() organisationId: string,
  ) {
    return this.tenantsService.customStepCallback(
      id,
      organisationId,
      step,
      'teardown',
      StepStatus.SUCCESS,
      dto,
    );
  }

  @Post(':id/steps/:step/teardown/fail')
  @AllowApiKey()
  @ApiSecurity('api-key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Your system could not tear down a custom step',
    description:
      'The teardown is FAILED and the customer stays DEPROVISIONING; removing it again sends a new step.teardown. Idempotent like the step callbacks.',
  })
  @ApiResponse({ status: 200, description: 'Recorded, duplicate or ignored' })
  @ApiResponse({
    status: 409,
    description:
      'No teardown is waiting on your system for this step, it already finished, or requestId is not the latest',
  })
  failTeardown(
    @Param('id', ParseCuidPipe) id: string,
    @Param('step', ParseStepNamePipe) step: ProvisioningStepName,
    @Body() dto: FailStepDto,
    @CurrentOrganisation() organisationId: string,
  ) {
    return this.tenantsService.customStepCallback(
      id,
      organisationId,
      step,
      'teardown',
      StepStatus.FAILED,
      dto,
    );
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Remove a tenant: drop its schema, revoke its key, cancel its subscription',
    description:
      'Publishes tenant.deprovision and answers with the tenant in DEPROVISIONING; it becomes DELETED (soft: readable by id, hidden from lists) once every part is torn down, and tenant.deleted is sent to the webhook. A test tenant reads DELETED at once. Calling it again resumes a teardown that failed and is a no-op once DELETED.',
  })
  delete(
    @Param('id', ParseCuidPipe) id: string,
    @CurrentOrganisation() organisationId: string,
  ) {
    return this.tenantsService.delete(id, organisationId);
  }
}
