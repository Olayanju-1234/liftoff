import { randomBytes } from 'crypto';

// Same shape as Prisma's @default(cuid()) (c + 24 of [a-z0-9]), which the gateway's
// ParseCuidPipe checks, drawn here so the row can carry values derived from its own id.
export const newTenantId = (): string => `c${randomBytes(12).toString('hex')}`;
