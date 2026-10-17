import { createHash, randomBytes } from 'crypto';

// Links carry the token; the database holds only its hash, so a read of the table
// can't be turned into a working link.
export const newToken = (): string => randomBytes(32).toString('base64url');

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
