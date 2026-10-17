import { createHmac, timingSafeEqual } from 'crypto';

// HMAC-SHA256 of the raw body, hex, as `sha256=<digest>`.
export function signWebhookBody(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

// What a receiver does; here so the README snippet is tested.
export function verifyWebhookSignature(
  secret: string,
  body: string,
  signature: string | undefined,
): boolean {
  if (!signature) {
    return false;
  }
  const expected = Buffer.from(signWebhookBody(secret, body));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
