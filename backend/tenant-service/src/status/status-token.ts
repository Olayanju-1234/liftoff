import { createHash, createHmac } from 'crypto';

// The token is derived, not drawn, so the API can hand the same link out later (on the
// tenant record, in the webhook) without storing it. Only its hash is in the database.
export const deriveStatusToken = (secret: string, tenantId: string): string =>
  createHmac('sha256', secret)
    .update(`status-token:${tenantId}`)
    .digest('base64url');

export const hashStatusToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export const statusUrlFor = (frontendUrl: string, token: string): string =>
  `${frontendUrl.replace(/\/+$/, '')}/status/${token}`;
