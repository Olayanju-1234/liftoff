import { HttpService } from '@nestjs/axios';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { CreateTenantDto } from '@liftoff/shared-types';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly httpService: HttpService) { }

  getHealth(): { status: string } {
    return { status: 'ok' };
  }

  getHello(): string {
    this.logger.log('GET /hello requested');
    return 'Hello from API Gateway!';
  }

  async createTenant(createTenantDto: CreateTenantDto) {
    this.logger.log(
      { name: createTenantDto.name, subdomain: createTenantDto.subdomain },
      'Attempting to create tenant...',
    );
    try {
      const { data } = await firstValueFrom(
        this.httpService.post('/tenants', createTenantDto),
      );
      this.logger.log(
        { tenantId: data.id },
        'Successfully initiated tenant creation.',
      );
      return data;
    } catch (error) {
      if (error instanceof AxiosError) {
        this.logger.error(
          {
            err: error.response?.data,
            status: error.response?.status,
          },
          'Error received from downstream service.',
        );
        throw new HttpException(
          error.response?.data,
          error.response?.status!,
        );
      }
      this.logger.error({ err: error }, 'Unknown error in createTenant.');
      throw error;
    }
  }
}