import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ParseStatusTokenPipe } from '../common/parse-status-token.pipe';
import { StatusService } from './status.service';

@ApiTags('Status')
@Controller('status')
export class StatusController {
  constructor(private readonly status: StatusService) {}

  // Public by design: the company's customer follows this link without an account.
  @Public()
  @Get(':token')
  @ApiOperation({
    summary: "A tenant's setup progress in plain words, for the customer",
    description:
      'No credentials. The token is the last segment of the statusUrl on every tenant record and webhook. Says only the company and customer names, the state, and the five steps by plain name; never an id, address before ready, or anything that names a system.',
  })
  @ApiResponse({ status: 404, description: 'No tenant matches the token' })
  publicStatus(@Param('token', ParseStatusTokenPipe) token: string) {
    return this.status.publicStatus(token);
  }
}
