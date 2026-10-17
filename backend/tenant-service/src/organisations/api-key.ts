import { createHash, randomBytes } from 'crypto';
import { API_KEY_PREFIX } from '@liftoff/shared-types';

export const API_KEY_PREFIX_LENGTH = 12;

export interface GeneratedApiKey {
  key: string;
  prefix: string;
  keyHash: string;
}

export const hashApiKey = (key: string): string =>
  createHash('sha256').update(key).digest('hex');

// 32 random bytes: the hash is the only copy kept, so the key itself must be unguessable.
export function generateApiKey(): GeneratedApiKey {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  return {
    key,
    prefix: key.slice(0, API_KEY_PREFIX_LENGTH),
    keyHash: hashApiKey(key),
  };
}
