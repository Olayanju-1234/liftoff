import { HttpService } from '@nestjs/axios';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { CreateTenantDto } from '@liftoff/shared-types';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly httpService: HttpService) { }

  getHealth(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  getHello(): string {
    this.logger.log('GET /hello requested');
    return 'Hello from API Gateway!';
  }

  // ============ AUTH METHODS ============

  async register(registerDto: any) {
    this.logger.log(`Registration attempt: ${registerDto.email}`);
    try {
      const { data } = await firstValueFrom(
        this.httpService.post('/auth/register', registerDto),
      );
      this.logger.log(`User registered successfully: ${registerDto.email}`);
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async login(loginDto: any) {
    this.logger.log(`Login attempt: ${loginDto.email}`);
    try {
      const { data } = await firstValueFrom(
        this.httpService.post('/auth/login', loginDto),
      );
      this.logger.log(`User logged in: ${loginDto.email}`);
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async refreshToken(refreshDto: any) {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post('/auth/refresh', refreshDto),
      );
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async logout(auth: string) {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post('/auth/logout', {}, this.getAuthHeaders(auth)),
      );
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getProfile(auth: string) {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get('/auth/me', this.getAuthHeaders(auth)),
      );
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  // ============ TENANT METHODS ============

  async createTenant(createTenantDto: CreateTenantDto, auth?: string) {
    this.logger.log(
      { name: createTenantDto.name, subdomain: createTenantDto.subdomain },
      'Attempting to create tenant...',
    );
    try {
      const { data } = await firstValueFrom(
        this.httpService.post('/tenants', createTenantDto, this.getAuthHeaders(auth)),
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

  async getTenants(auth?: string) {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get('/tenants', this.getAuthHeaders(auth)),
      );
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getEvents(auth?: string) {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get('/tenants/events', this.getAuthHeaders(auth)),
      );
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getTenant(id: string, auth?: string) {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`/tenants/${id}`, this.getAuthHeaders(auth)),
      );
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async getTenantEvents(id: string, auth?: string) {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`/tenants/${id}/events`, this.getAuthHeaders(auth)),
      );
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async deleteTenant(id: string, auth?: string) {
    this.logger.log({ tenantId: id }, 'Attempting to delete tenant...');
    try {
      const { data } = await firstValueFrom(
        this.httpService.delete(`/tenants/${id}`, this.getAuthHeaders(auth)),
      );
      this.logger.log({ tenantId: id }, 'Successfully deleted tenant.');
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  // ============ SETTINGS METHODS ============

  async getSettings(auth?: string) {
    this.logger.log('Fetching settings...');
    try {
      const { data } = await firstValueFrom(
        this.httpService.get('/settings', this.getAuthHeaders(auth)),
      );
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async updateSettings(updateSettingsDto: any, auth?: string) {
    this.logger.log('Updating settings...');
    try {
      const { data } = await firstValueFrom(
        this.httpService.put('/settings', updateSettingsDto, this.getAuthHeaders(auth)),
      );
      return data;
    } catch (error) {
      this.handleError(error);
    }
  }

  // ============ HELPERS ============

  private getAuthHeaders(auth?: string) {
    if (!auth) return {};
    return {
      headers: {
        Authorization: auth,
      },
    };
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
        error.response?.data || 'Service unavailable',
        error.response?.status || 503,
      );
    }
    this.logger.error({ err: error }, 'Unknown error.');
    throw error;
  }
}