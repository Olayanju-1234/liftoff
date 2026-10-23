import { NotFoundException, type PipeTransform } from '@nestjs/common';
import { createHash, createHmac, randomBytes } from 'crypto';
import { DEMO_TOKEN_PATTERN } from '@liftoff/shared-types';

export const DEMO_NOT_FOUND = 'This demo has ended or the link is incomplete';

export const newDemoToken = (): string => randomBytes(32).toString('base64url');

export const hashDemoToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

// Keyed, so the stored value can't be reversed by hashing every IPv4 address.
export const hashClientIp = (secret: string, ip: string | undefined): string =>
  createHmac('sha256', secret)
    .update(`demo-ip:${ip?.trim() || 'unknown'}`)
    .digest('hex');

// Anything that is not a demo token gets the same 404 as an unknown one, without a query.
export class ParseDemoTokenPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!DEMO_TOKEN_PATTERN.test(value)) {
      throw new NotFoundException(DEMO_NOT_FOUND);
    }
    return value;
  }
}
