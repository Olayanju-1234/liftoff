import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  deriveStatusToken,
  hashStatusToken,
  statusUrlFor,
} from './status-token';

export const DEFAULT_FRONTEND_URL = 'http://localhost:5173';

@Injectable()
export class StatusTokenService {
  private readonly logger = new Logger(StatusTokenService.name);
  private readonly secret: string;
  readonly frontendUrl: string;

  constructor(config: ConfigService) {
    const own = config.get<string>('STATUS_TOKEN_SECRET')?.trim();
    // JWT_SECRET is required at boot, so there is always a secret; its own var decouples them.
    this.secret = own || config.getOrThrow<string>('JWT_SECRET');
    if (!own) {
      this.logger.warn(
        'STATUS_TOKEN_SECRET is not set: status-page tokens are derived from JWT_SECRET, so rotating it breaks every status link',
      );
    }
    this.frontendUrl = (
      config.get<string>('FRONTEND_URL')?.trim() || DEFAULT_FRONTEND_URL
    ).replace(/\/+$/, '');
  }

  tokenFor(tenantId: string): string {
    return deriveStatusToken(this.secret, tenantId);
  }

  hashFor(tenantId: string): string {
    return hashStatusToken(this.tokenFor(tenantId));
  }

  urlFor(tenantId: string): string {
    return statusUrlFor(this.frontendUrl, this.tokenFor(tenantId));
  }
}
