import { HttpService } from '@nestjs/axios';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AxiosError, AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  CancelTenantDto,
  CreateTenantDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  UpdateSettingsDto,
} from '@liftoff/shared-types';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly httpService: HttpService) {}

  getHealth(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  getHello(): string {
    return 'Hello from API Gateway!';
  }

  // ============ AUTH METHODS ============

  register(dto: RegisterDto) {
    this.logger.log({ email: dto.email }, 'Registration attempt');
    return this.proxy('post', '/auth/register', dto);
  }

  login(dto: LoginDto) {
    this.logger.log({ email: dto.email }, 'Login attempt');
    return this.proxy('post', '/auth/login', dto);
  }

  refreshToken(dto: RefreshTokenDto) {
    return this.proxy('post', '/auth/refresh', dto);
  }

  logout(auth: string) {
    return this.proxy('post', '/auth/logout', {}, auth);
  }

  getProfile(auth: string) {
    return this.proxy('get', '/auth/me', undefined, auth);
  }

  // ============ TENANT METHODS ============

  async createTenant(dto: CreateTenantDto, auth?: string) {
    this.logger.log(
      { name: dto.name, subdomain: dto.subdomain },
      'Creating tenant',
    );
    const data = await this.proxy<{ id: string }>('post', '/tenants', dto, auth);
    this.logger.log({ tenantId: data.id }, 'Tenant creation initiated');
    return data;
  }

  getTenants(auth?: string) {
    return this.proxy('get', '/tenants', undefined, auth);
  }

  getEvents(auth?: string) {
    return this.proxy('get', '/tenants/events', undefined, auth);
  }

  getTenant(id: string, auth?: string) {
    return this.proxy('get', `/tenants/${id}`, undefined, auth);
  }

  getTenantEvents(id: string, auth?: string) {
    return this.proxy('get', `/tenants/${id}/events`, undefined, auth);
  }

  async deleteTenant(id: string, auth?: string) {
    this.logger.log({ tenantId: id }, 'Deleting tenant');
    return this.proxy('delete', `/tenants/${id}`, undefined, auth);
  }

  async cancelTenant(id: string, dto: CancelTenantDto, auth?: string) {
    this.logger.log({ tenantId: id }, 'Cancelling tenant provisioning');
    return this.proxy('post', `/tenants/${id}/cancel`, dto, auth);
  }

  // ============ SETTINGS METHODS ============

  getSettings(auth?: string) {
    return this.proxy('get', '/settings', undefined, auth);
  }

  updateSettings(dto: UpdateSettingsDto, auth?: string) {
    return this.proxy('put', '/settings', dto, auth);
  }

  // ============ INTERNAL ============

  private async proxy<T = unknown>(
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    body?: unknown,
    auth?: string,
  ): Promise<T> {
    const config = this.buildConfig(auth);
    try {
      const response =
        method === 'get' || method === 'delete'
          ? await firstValueFrom(this.httpService[method]<T>(path, config))
          : await firstValueFrom(this.httpService[method]<T>(path, body, config));
      return response.data;
    } catch (error) {
      this.handleError(error, method, path);
    }
  }

  private buildConfig(auth?: string): AxiosRequestConfig {
    return auth ? { headers: { Authorization: auth } } : {};
  }

  /**
   * Maps downstream errors back to the client.
   * 4xx from downstream → forwarded as-is (client error).
   * 5xx, network failures, timeouts → 503 (don't leak infra details).
   */
  private handleError(error: unknown, method: string, path: string): never {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const downstreamBody = error.response?.data;

      if (status && status >= 400 && status < 500) {
        this.logger.warn(
          { status, path, method, err: downstreamBody },
          'Downstream client error',
        );
        throw new HttpException(downstreamBody ?? error.message, status);
      }

      this.logger.error(
        { status, path, method, err: downstreamBody ?? error.message },
        'Downstream service failure',
      );
      throw new ServiceUnavailableException('Upstream service unavailable');
    }
    this.logger.error({ err: error, path, method }, 'Unexpected gateway error');
    throw new HttpException(
      'Internal gateway error',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
