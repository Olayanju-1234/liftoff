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
      this.handleError(error);
    }
  }

  async getTenants() {
    try {
      const { data } = await firstValueFrom(this.httpService.get('/tenants'));
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getEvents() {
    try {
      const { data } = await firstValueFrom(this.httpService.get('/tenants/events'));
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getTenant(id: string) {
    try {
      const { data } = await firstValueFrom(this.httpService.get(`/tenants/${id}`));
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getTenantEvents(id: string) {
    try {
      const { data } = await firstValueFrom(this.httpService.get(`/tenants/${id}/events`));
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async deleteTenant(id: string) {
    this.logger.log({ tenantId: id }, 'Attempting to delete tenant...');
    try {
      const { data } = await firstValueFrom(this.httpService.delete(`/tenants/${id}`));
      this.logger.log({ tenantId: id }, 'Successfully deleted tenant.');
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getSettings() {
    this.logger.log('Fetching settings...');
    try {
      const { data } = await firstValueFrom(this.httpService.get('/settings'));
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async updateSettings(updateSettingsDto: any) {
    this.logger.log('Updating settings...');
    try {
      const { data } = await firstValueFrom(this.httpService.put('/settings', updateSettingsDto));
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: any) {
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
    this.logger.error({ err: error }, 'Unknown error.');
    throw error;
  }
}