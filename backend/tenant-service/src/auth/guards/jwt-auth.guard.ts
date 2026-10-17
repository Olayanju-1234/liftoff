import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { API_KEY_HEADER, API_KEY_PREFIX } from '@liftoff/shared-types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_API_KEY } from '../decorators/allow-api-key.decorator';
import { ApiKeysService } from '../../organisations/api-keys.service';
import type { Principal } from '../principal';

type AuthedRequest = FastifyRequest & { user?: Principal };

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private readonly apiKeys: ApiKeysService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip JWT authentication for non-HTTP contexts (RabbitMQ handlers, etc.)
    const contextType = context.getType();
    if (contextType !== 'http') {
      return true;
    }

    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      targets,
    );
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const apiKey = extractApiKey(request);
    if (apiKey !== undefined) {
      const allowed = this.reflector.getAllAndOverride<boolean>(
        ALLOW_API_KEY,
        targets,
      );
      if (!allowed) {
        throw new UnauthorizedException(
          'This route needs a signed-in user, not an API key',
        );
      }
      request.user = await this.apiKeys.authenticate(apiKey);
      return true;
    }

    return (await super.canActivate(context)) as boolean;
  }
}

// A key in x-api-key, or as a bearer token that carries the key prefix (a JWT never does).
function extractApiKey(request: FastifyRequest): string | undefined {
  const header = request.headers[API_KEY_HEADER];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  if (fromHeader) {
    return fromHeader.trim();
  }
  const auth = request.headers.authorization;
  const match = auth && /^Bearer\s+(.+)$/i.exec(auth.trim());
  const token = match?.[1]?.trim();
  return token?.startsWith(API_KEY_PREFIX) ? token : undefined;
}
