import { HttpService } from '@nestjs/axios';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AxiosRequestConfig, isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  API_KEY_HEADER,
  CancelTenantDto,
  ConfirmEmailChangeDto,
  CreateApiKeyDto,
  CreateTenantDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  UpdateOrganisationDto,
  UpdateSettingsDto,
} from '@liftoff/shared-types';

type DownstreamErrorBody = string | Record<string, unknown>;

// What the caller presented: a user bearer token, a company API key, or both headers.
export interface Credentials {
  auth?: string;
  apiKey?: string;
}

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

  async createTenant(dto: CreateTenantDto, credentials: Credentials) {
    this.logger.log(
      {
        name: dto.name,
        subdomain: dto.subdomain,
        viaApiKey: !!credentials.apiKey,
      },
      'Creating tenant',
    );
    const data = await this.proxy<{ id: string }>(
      'post',
      '/tenants',
      dto,
      credentials,
    );
    this.logger.log({ tenantId: data.id }, 'Tenant creation initiated');
    return data;
  }

  getTenants(auth?: string) {
    return this.proxy('get', '/tenants', undefined, auth);
  }

  getEvents(auth?: string) {
    return this.proxy('get', '/tenants/events', undefined, auth);
  }

  getTenant(id: string, credentials: Credentials) {
    return this.proxy('get', `/tenants/${id}`, undefined, credentials);
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

  // ============ ORGANISATION METHODS ============

  getOrganisation(auth?: string) {
    return this.proxy('get', '/organisation', undefined, auth);
  }

  updateOrganisation(dto: UpdateOrganisationDto, auth?: string) {
    return this.proxy('put', '/organisation', dto, auth);
  }

  createApiKey(dto: CreateApiKeyDto, auth?: string) {
    this.logger.log({ name: dto.name }, 'Creating API key');
    return this.proxy('post', '/api-keys', dto, auth);
  }

  listApiKeys(auth?: string) {
    return this.proxy('get', '/api-keys', undefined, auth);
  }

  revokeApiKey(id: string, auth?: string) {
    this.logger.log({ apiKeyId: id }, 'Revoking API key');
    return this.proxy('delete', `/api-keys/${id}`, undefined, auth);
  }

  // ============ SETTINGS METHODS ============

  getSettings(auth?: string) {
    return this.proxy('get', '/settings', undefined, auth);
  }

  updateSettings(dto: UpdateSettingsDto, auth?: string) {
    return this.proxy('put', '/settings', dto, auth);
  }

  confirmEmailChange(dto: ConfirmEmailChangeDto) {
    return this.proxy('post', '/settings/email/confirm', dto);
  }

  // ============ INTERNAL ============

  private async proxy<T = unknown>(
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    body?: unknown,
    credentials?: string | Credentials,
  ): Promise<T> {
    const config = this.buildConfig(
      typeof credentials === 'string' ? { auth: credentials } : credentials,
    );
    try {
      const response =
        method === 'get' || method === 'delete'
          ? await firstValueFrom(this.httpService[method]<T>(path, config))
          : await firstValueFrom(
              this.httpService[method]<T>(path, body, config),
            );
      return response.data;
    } catch (error) {
      this.handleError(error, method, path);
    }
  }

  // Both headers go through verbatim; tenant-service decides what each route accepts.
  private buildConfig(credentials?: Credentials): AxiosRequestConfig {
    const headers: Record<string, string> = {};
    if (credentials?.auth) {
      headers.Authorization = credentials.auth;
    }
    if (credentials?.apiKey) {
      headers[API_KEY_HEADER] = credentials.apiKey;
    }
    return Object.keys(headers).length > 0 ? { headers } : {};
  }

  /**
   * Maps downstream errors back to the client.
   * 4xx from downstream → forwarded as-is (client error).
   * 5xx, network failures, timeouts → 503 (don't leak infra details).
   */
  private handleError(error: unknown, method: string, path: string): never {
    if (isAxiosError<DownstreamErrorBody>(error)) {
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
