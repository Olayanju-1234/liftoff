import { FastifyAdapter } from '@nestjs/platform-fastify';

// nginx on the same box is the only proxy. Trusting loopback makes req.ip the visitor
// (the address nginx appends to X-Forwarded-For), so per-IP limits are per visitor.
export const createAdapter = () =>
  new FastifyAdapter({ trustProxy: 'loopback' });
