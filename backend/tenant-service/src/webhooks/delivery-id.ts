import { createHash } from 'crypto';

const LIFTOFF_NAMESPACE = '5b208bbe-406a-400d-a95c-c1e17184f860';

// A name-based (version 5) UUID: the same name always gives the same UUID.
export function uuidV5(name: string, namespace: string): string {
  const bytes = createHash('sha1')
    .update(Buffer.from(namespace.replace(/-/g, ''), 'hex'))
    .update(name)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

// x-liftoff-delivery for a durable delivery. workflowd's activity id is the same on every
// attempt, and the header is documented as a UUID, so it is hashed into one.
export const deliveryIdFor = (activityId: string): string =>
  uuidV5(activityId, LIFTOFF_NAMESPACE);
