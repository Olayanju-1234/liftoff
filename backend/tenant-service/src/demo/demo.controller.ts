import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import {
  CreateDemoTenantDto,
  DEMO_CLIENT_IP_HEADER,
} from '@liftoff/shared-types';
import { Public } from '../auth/decorators/public.decorator';
import { QuotaExceededException } from '../tenants/quotas.service';
import { DemoService } from './demo.service';
import { ParseDemoTokenPipe } from './demo-token';

// Public by design: a visitor runs the real pipeline without an account.
@ApiTags('Demo')
@Controller('demo/tenants')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Start a live demo customer',
    description:
      'Creates a test tenant in the demo organisation and runs it through the real pipeline. Returns a token for the live view. Removed after 15 minutes.',
  })
  @ApiResponse({
    status: 429,
    description: 'Per-visitor limit reached, or the demo is full',
  })
  async create(
    @Body() dto: CreateDemoTenantDto,
    @Headers(DEMO_CLIENT_IP_HEADER) clientIp: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    try {
      return await this.demo.create(dto, clientIp);
    } catch (error) {
      if (error instanceof QuotaExceededException) {
        void reply.header('Retry-After', String(error.retryAfterSeconds));
      }
      throw error;
    }
  }

  @Public()
  @Get(':token')
  @ApiOperation({ summary: 'The demo customer: steps, status and event log' })
  @ApiResponse({ status: 404, description: 'No demo matches the token' })
  view(@Param('token', ParseDemoTokenPipe) token: string) {
    return this.demo.view(token);
  }

  @Public()
  @Post(':token/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry the failed step of a FAILED demo customer' })
  @ApiResponse({ status: 400, description: 'The demo customer is not FAILED' })
  retry(@Param('token', ParseDemoTokenPipe) token: string) {
    return this.demo.retry(token);
  }
}
