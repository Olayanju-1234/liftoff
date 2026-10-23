import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { StartDemoDto } from '@liftoff/shared-types';
import { Public } from '../auth/decorators/public.decorator';
import { ParseStatusTokenPipe } from '../common/parse-status-token.pipe';
import { DemoBusyException, DemoService } from './demo.service';

// Public by design: anyone can watch a throwaway customer go through the real pipeline.
@ApiTags('Live demo')
@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Public()
  @Post()
  @ApiOperation({
    summary: 'Start a live demo run',
    description:
      'No credentials. Provisions a test customer in the demo organisation through every real service, optionally failing one step once. The run is removed after 15 minutes.',
  })
  @ApiResponse({ status: 201, description: '{ token, statusUrl, expiresAt }' })
  @ApiResponse({ status: 429, description: 'Too many runs going; Retry-After' })
  async start(
    @Body() dto: StartDemoDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    try {
      return await this.demo.start(dto);
    } catch (error) {
      if (error instanceof DemoBusyException) {
        void reply.header('Retry-After', String(error.retryAfterSeconds));
      }
      throw error;
    }
  }

  @Public()
  @Get(':token')
  @ApiOperation({
    summary: 'A demo run: its customer and how the run is set up',
  })
  @ApiResponse({ status: 404, description: 'No demo run matches the token' })
  view(@Param('token', ParseStatusTokenPipe) token: string) {
    return this.demo.view(token);
  }

  @Public()
  @Get(':token/events')
  @ApiOperation({ summary: "A demo run's event log, newest first" })
  @ApiResponse({ status: 404, description: 'No demo run matches the token' })
  events(@Param('token', ParseStatusTokenPipe) token: string) {
    return this.demo.events(token);
  }

  @Public()
  @Post(':token/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run the failed step of a FAILED demo run again' })
  @ApiResponse({ status: 400, description: 'The run is not FAILED' })
  @ApiResponse({ status: 404, description: 'No demo run matches the token' })
  retry(@Param('token', ParseStatusTokenPipe) token: string) {
    return this.demo.retry(token);
  }
}
