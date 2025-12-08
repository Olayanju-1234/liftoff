import { Controller, Get, Logger } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly appService: AppService) { }

  @Public()
  @Get('health')
  getHealth(): { status: string } {
    this.logger.log('Health check requested');
    return this.appService.getHealth();
  }
}
