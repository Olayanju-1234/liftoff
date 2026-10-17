import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { FastifyRequest } from 'fastify';
import { INTERNAL_TOKEN_HEADER } from '@liftoff/shared-types';

export const INTERNAL_API_TOKEN_ENV = 'INTERNAL_API_TOKEN';
export const INTERNAL_API_DISABLED =
  'The internal API is disabled: INTERNAL_API_TOKEN is not set';

// Routes under /internal are for the workers, which share INTERNAL_API_TOKEN with this
// service. The gateway never proxies them.
@Injectable()
export class InternalTokenGuard implements CanActivate {
  private readonly token: Buffer | null;

  constructor(config: ConfigService) {
    const raw = config.get<string>(INTERNAL_API_TOKEN_ENV)?.trim();
    this.token = raw ? Buffer.from(raw) : null;
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.token) {
      throw new ServiceUnavailableException(INTERNAL_API_DISABLED);
    }
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const header = request.headers[INTERNAL_TOKEN_HEADER];
    const presented = Array.isArray(header) ? header[0] : header;
    const candidate = Buffer.from(presented?.trim() ?? '');
    if (
      candidate.length !== this.token.length ||
      !timingSafeEqual(candidate, this.token)
    ) {
      throw new UnauthorizedException('Invalid internal token');
    }
    return true;
  }
}
