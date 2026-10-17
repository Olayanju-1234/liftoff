import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  INTERNAL_TOKEN_HEADER,
  type InternalTenantNotification,
} from '@liftoff/shared-types';

export const INTERNAL_TIMEOUT_MS = 5_000;

// Asks tenant-service who in the company to email and what about. Same shared token as
// billing-service uses.
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
        'TENANT_SERVICE_URL or INTERNAL_API_TOKEN is not set: the company cannot be emailed and the notification step is SKIPPED',
      );
    }
  }

  get configured(): boolean {
    return this.baseUrl !== null && this.token !== null;
  }

  async notificationDetails(
    tenantId: string,
  ): Promise<InternalTenantNotification> {
    if (!this.baseUrl || !this.token) {
      throw new Error(
        'Cannot fetch notification details: TENANT_SERVICE_URL or INTERNAL_API_TOKEN is not set',
      );
    }
    const response = await this.fetchImpl(
      `${this.baseUrl}/internal/tenants/${encodeURIComponent(tenantId)}/notification`,
      {
        headers: { [INTERNAL_TOKEN_HEADER]: this.token },
        signal: AbortSignal.timeout(INTERNAL_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new Error(
        `tenant-service answered ${response.status} for the notification details of tenant ${tenantId}`,
      );
    }
    return (await response.json()) as InternalTenantNotification;
  }
}
