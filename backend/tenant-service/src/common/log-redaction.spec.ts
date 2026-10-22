import { pino } from 'pino';
import { LOG_REDACT_PATHS } from '@liftoff/shared-types';

// The same options every service passes to pino-http, against the request shape it logs.
it('keeps credentials out of request logs and leaves the rest readable', () => {
  const lines: string[] = [];
  const logger = pino(
    { redact: { paths: LOG_REDACT_PATHS, censor: '[redacted]' } },
    { write: (line: string) => lines.push(line) },
  );

  logger.info(
    {
      req: {
        method: 'POST',
        url: '/tenants',
        headers: {
          host: 'api.liftoff.test',
          authorization: 'Bearer eyJsecret',
          cookie: 'refresh=secret',
          'x-api-key': 'lk_secret',
          'x-internal-token': 'internal-secret',
        },
      },
      res: { statusCode: 201, headers: { 'set-cookie': 'refresh=secret' } },
    },
    'request completed',
  );

  expect(lines[0]).not.toContain('secret');
  const entry = JSON.parse(lines[0]) as {
    req: { url: string; headers: Record<string, string> };
    res: { headers: Record<string, string> };
  };
  expect(entry.req.url).toBe('/tenants');
  expect(entry.req.headers).toEqual({
    host: 'api.liftoff.test',
    authorization: '[redacted]',
    cookie: '[redacted]',
    'x-api-key': '[redacted]',
    'x-internal-token': '[redacted]',
  });
  expect(entry.res.headers['set-cookie']).toBe('[redacted]');
});
