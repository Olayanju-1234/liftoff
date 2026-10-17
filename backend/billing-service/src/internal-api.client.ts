import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  INTERNAL_TOKEN_HEADER,
  type InternalBillingConfig,
} from '@liftoff/shared-types';

export const INTERNAL_TIMEOUT_MS = 5_000;

// Fetches per-organisation Stripe configuration from tenant-service. The key never rides
// through RabbitMQ: it is decrypted by tenant-service for this call only.
@Injectable()
export class InternalApiClient {
  private readonly logger = new Logger(InternalApiClient.name);
  private readonly baseUrl: string | null;
  private readonly token: string | null;
  // Replaced in tests.
  fetchImpl: typeof fetch = fetch;

  constructor(config: ConfigService) {
    this.baseUrl =
      config.get<string>('TENANT_SERVICE_URL')?.trim().replace(/\/+$/, '') ||
      null;
    this.token = config.get<string>('INTERNAL_API_TOKEN')?.trim() || null;
    if (!this.configured) {
      this.logger.warn(
        'TENANT_SERVICE_URL or INTERNAL_API_TOKEN is not set: real tenants will fail at billing until both are; test tenants are still skipped',
      );
    }
  }

  get configured(): boolean {
    return this.baseUrl !== null && this.token !== null;
  }

  async billingConfig(tenantId: string): Promise<InternalBillingConfig> {
    if (!this.baseUrl || !this.token) {
      throw new Error(
        'Cannot fetch billing configuration: TENANT_SERVICE_URL or INTERNAL_API_TOKEN is not set',
      );
    }
    const response = await this.fetchImpl(
      `${this.baseUrl}/internal/tenants/${encodeURIComponent(tenantId)}/billing`,
      {
        headers: { [INTERNAL_TOKEN_HEADER]: this.token },
        signal: AbortSignal.timeout(INTERNAL_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new Error(
        `tenant-service answered ${response.status} for the billing configuration of tenant ${tenantId}`,
      );
    }
    return (await response.json()) as InternalBillingConfig;
  }
}
