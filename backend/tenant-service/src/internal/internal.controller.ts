import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ParseCuidPipe } from '../common/parse-cuid.pipe';
import { InternalTokenGuard } from './internal-token.guard';
import { InternalService } from './internal.service';

// Worker-facing. @Public skips the user guard; InternalTokenGuard checks the shared token.
@ApiExcludeController()
@Public()
@UseGuards(InternalTokenGuard)
@Controller('internal')
export class InternalController {
  constructor(private readonly internal: InternalService) {}

  @Get('tenants/:id/billing')
  billingConfig(@Param('id', ParseCuidPipe) id: string) {
    return this.internal.billingConfig(id);
  }

  @Get('tenants/:id/notification')
  notificationDetails(@Param('id', ParseCuidPipe) id: string) {
    return this.internal.notificationDetails(id);
  }
}
