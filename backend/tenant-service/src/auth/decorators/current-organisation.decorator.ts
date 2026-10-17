import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { Principal } from '../principal';

// Every tenant and company route is scoped by this. A user without an organisation
// (not yet backfilled) gets 403 rather than a query that matches everything.
export const CurrentOrganisation = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const { user } = ctx.switchToHttp().getRequest<{ user?: Principal }>();
    const organisationId = user?.organisationId;
    if (!organisationId) {
      throw new ForbiddenException('This account has no organisation yet');
    }
    return organisationId;
  },
);
