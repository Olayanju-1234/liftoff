import type { User } from '.prisma/tenant-client';

// What an API key resolves to. It has no user, only the organisation that owns it.
export interface ApiKeyPrincipal {
  kind: 'api-key';
  apiKeyId: string;
  organisationId: string;
}

export type Principal = User | ApiKeyPrincipal;

export function isApiKeyPrincipal(
  principal: Principal | undefined,
): principal is ApiKeyPrincipal {
  return (principal as ApiKeyPrincipal | undefined)?.kind === 'api-key';
}
