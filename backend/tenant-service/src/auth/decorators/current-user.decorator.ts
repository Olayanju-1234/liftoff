import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { User } from '.prisma/tenant-client';
import { isApiKeyPrincipal, type Principal } from '../principal';

// The signed-in user, or undefined when the caller is an API key.
export const CurrentUser = createParamDecorator(
  (data: keyof User | undefined, ctx: ExecutionContext) => {
    const { user } = ctx.switchToHttp().getRequest<{ user?: Principal }>();
    if (!user || isApiKeyPrincipal(user)) {
      return undefined;
    }
    if (data) {
      return user[data];
    }
    return user;
  },
);
