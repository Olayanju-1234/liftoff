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
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENT_REPLAYED_HEADER,
} from '@liftoff/shared-types';
import { ParseCuidPipe } from '../common/parse-cuid.pipe';
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
