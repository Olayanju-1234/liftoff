import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac } from 'crypto';

import {
  WEBHOOK_BACKOFF_MS,
  WEBHOOK_TIMEOUT_MS,
  WebhookService,
  settle,
} from './webhook.service';
import { DurableService } from '../durable/durable.service';
import { ACTIVITY, TENANT_WEBHOOK_WORKFLOW } from '../durable/workflows';
import { signWebhookBody, verifyWebhookSignature } from './signature';
import * as destination from './destination';
import { PrismaService } from '../prisma.service';
import { StatusTokenService } from '../status/status-token.service';

const tenantRow = {
  id: 't1',
  name: 'Globex',
  subdomain: 'globex',
  status: 'ACTIVE',
  planId: 'starter',
  organisationId: 'org-1',
  isWorkspace: false,
};

const withWebhook = {
  ...tenantRow,
  organisation: {
    webhookUrl: 'https://hooks.acme.com/liftoff',
    webhookSecret: 'whsec_test',
    baseDomain: 'acme.app',
  },
};

const response = (status: number) =>
  ({ ok: status >= 200 && status < 300, status }) as Response;

describe('WebhookService', () => {
  let service: WebhookService;
  let prisma: { tenant: { findUnique: jest.Mock } };
  let fetchImpl: jest.Mock;
  let sleep: jest.Mock;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    // The destination is public for these tests; destination.spec covers the blocking.
    jest.spyOn(destination, 'assertPublicDestination').mockResolvedValue();

    prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue(withWebhook) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: StatusTokenService,
          useValue: {
            urlFor: (id: string) => `https://app.test/status/tok(${id})`,
          },
        },
      ],
    }).compile();
    service = moduleRef.get(WebhookService);
    fetchImpl = jest.fn().mockResolvedValue(response(200));
    sleep = jest.fn().mockResolvedValue(undefined);
    service.fetchImpl = fetchImpl;
    service.sleep = sleep;
  });

  afterEach(() => jest.restoreAllMocks());

  describe('signature', () => {
    it('is the hex HMAC-SHA256 of the body, prefixed sha256=', () => {
      const body = '{"event":"tenant.active"}';
      const expected = createHmac('sha256', 'whsec_test')
        .update(body)
        .digest('hex');

      expect(signWebhookBody('whsec_test', body)).toBe(`sha256=${expected}`);
      expect(
        verifyWebhookSignature('whsec_test', body, `sha256=${expected}`),
      ).toBe(true);
      expect(
        verifyWebhookSignature('whsec_test', body + ' ', `sha256=${expected}`),
      ).toBe(false);
      expect(
        verifyWebhookSignature('whsec_other', body, `sha256=${expected}`),
      ).toBe(false);
      expect(verifyWebhookSignature('whsec_test', body, undefined)).toBe(false);
    });
  });

  describe('deliver', () => {
    it('POSTs {event, tenant} to the organisation URL, signed with its secret', async () => {
      await expect(service.deliver('t1', 'tenant.active')).resolves.toBe(true);

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
      expect(url.toString()).toBe('https://hooks.acme.com/liftoff');
      expect(init.method).toBe('POST');
      expect(init.redirect).toBe('manual');
      expect(init.signal).toBeInstanceOf(AbortSignal);

      const body = init.body as string;
      // The record carries the public status link, so the company can pass it on from here.
      expect(JSON.parse(body)).toEqual({
        event: 'tenant.active',
        tenant: {
          ...tenantRow,
          address: 'globex.acme.app',
          statusUrl: 'https://app.test/status/tok(t1)',
          planName: 'Starter',
        },
      });
      // The organisation (and its secret) never travels with the tenant.
      expect(body).not.toContain('whsec_test');

      const headers = init.headers as Record<string, string>;
      expect(headers['content-type']).toBe('application/json');
      expect(headers['x-liftoff-event']).toBe('tenant.active');
      expect(headers['x-liftoff-delivery']).toMatch(/^[0-9a-f-]{36}$/);
      expect(headers['x-liftoff-signature']).toBe(
        signWebhookBody('whsec_test', body),
      );
      expect(
        verifyWebhookSignature(
          'whsec_test',
          body,
          headers['x-liftoff-signature'],
        ),
      ).toBe(true);
    });

    it('does nothing when the organisation has no webhook URL', async () => {
      prisma.tenant.findUnique.mockResolvedValueOnce({
        ...tenantRow,
        organisation: { webhookUrl: null, webhookSecret: null },
      });

      await expect(service.deliver('t1', 'tenant.failed')).resolves.toBe(false);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('does nothing when the tenant is gone or has no organisation', async () => {
      prisma.tenant.findUnique.mockResolvedValueOnce(null);
      await expect(service.deliver('t1', 'tenant.failed')).resolves.toBe(false);

      prisma.tenant.findUnique.mockResolvedValueOnce({
        ...tenantRow,
        organisation: null,
      });
      await expect(service.deliver('t1', 'tenant.failed')).resolves.toBe(false);

      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('retries 5xx and network errors with backoff, then succeeds', async () => {
      fetchImpl
        .mockResolvedValueOnce(response(503))
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce(response(204));

      await expect(service.deliver('t1', 'tenant.active')).resolves.toBe(true);

      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(sleep.mock.calls.map(([ms]) => ms as number)).toEqual(
        WEBHOOK_BACKOFF_MS.slice(0, 2),
      );
      // Every attempt sends the same signed body.
      const bodies = new Set(
        fetchImpl.mock.calls.map(([, init]) => (init as RequestInit).body),
      );
      expect(bodies.size).toBe(1);
    });

    it('gives up after four attempts and logs the failure', async () => {
      const error = jest.spyOn(Logger.prototype, 'error');
      fetchImpl.mockResolvedValue(response(500));

      await expect(service.deliver('t1', 'tenant.active')).resolves.toBe(false);

      expect(fetchImpl).toHaveBeenCalledTimes(WEBHOOK_BACKOFF_MS.length + 1);
      expect(sleep.mock.calls.map(([ms]) => ms as number)).toEqual(
        WEBHOOK_BACKOFF_MS,
      );
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('gave up after 4 attempts'),
      );
    });

    it('does not retry a 4xx: the receiver rejected the delivery', async () => {
      fetchImpl.mockResolvedValueOnce(response(410));

      await expect(service.deliver('t1', 'tenant.active')).resolves.toBe(false);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('treats a redirect as a failed attempt rather than following it', async () => {
      fetchImpl
        .mockResolvedValueOnce(response(302))
        .mockResolvedValueOnce(response(200));

      await expect(service.deliver('t1', 'tenant.active')).resolves.toBe(true);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('refuses to send when the host resolves to a private address, and retries later', async () => {
      (destination.assertPublicDestination as jest.Mock)
        .mockRejectedValueOnce(new Error('resolves to 10.0.0.7'))
        .mockResolvedValue(undefined);

      await expect(service.deliver('t1', 'tenant.active')).resolves.toBe(true);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(sleep).toHaveBeenCalledTimes(1);
    });

    it('stops retrying once the caller no longer needs the delivery', async () => {
      fetchImpl.mockResolvedValue(response(503));
      const stillWanted = jest
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const result = await service.post({
        url: new URL('https://steps.acme.com/x'),
        secret: 'whsec_test',
        event: 'step.requested',
        body: '{}',
        label: 'step.requested address for tenant t1',
        stillWanted,
      });

      expect(result).toEqual({ delivered: false, abandoned: true });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('reports the last status and error when it gives up', async () => {
      fetchImpl.mockResolvedValue(response(502));

      await expect(
        service.post({
          url: new URL('https://steps.acme.com/x'),
          secret: 'whsec_test',
          event: 'step.requested',
          body: '{}',
          label: 'step.requested address for tenant t1',
        }),
      ).resolves.toEqual({
        delivered: false,
        status: 502,
        error: 'answered 502',
      });
    });

    it('bounds each attempt with a timeout', () => {
      expect(WEBHOOK_TIMEOUT_MS).toBe(10_000);
    });
  });

  describe('notify', () => {
    it('never rejects or throws into the caller, even when delivery blows up', async () => {
      const error = jest.spyOn(Logger.prototype, 'error');
      prisma.tenant.findUnique.mockRejectedValueOnce(new Error('db down'));

      expect(() => service.notify('t1', 'tenant.failed')).not.toThrow();
      await new Promise((resolve) => process.nextTick(resolve));

      expect(error).toHaveBeenCalledWith(
        'Webhook tenant.failed for tenant t1 failed: db down',
      );
    });
  });
});

describe('WebhookService with workflowd', () => {
  let service: WebhookService;
  let prisma: { tenant: { findUnique: jest.Mock } };
  let fetchImpl: jest.Mock;
  let durable: { enabled: boolean; start: jest.Mock; activity: jest.Mock };

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(destination, 'assertPublicDestination').mockResolvedValue();
    prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue(withWebhook) },
    };
    durable = {
      enabled: true,
      start: jest.fn().mockResolvedValue(true),
      activity: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: PrismaService, useValue: prisma },
        { provide: DurableService, useValue: durable },
        {
          provide: StatusTokenService,
          useValue: { urlFor: (id: string) => `https://app.test/status/${id}` },
        },
      ],
    }).compile();
    service = moduleRef.get(WebhookService);
    fetchImpl = jest.fn().mockResolvedValue(response(200));
    service.fetchImpl = fetchImpl;
  });
  afterEach(() => jest.restoreAllMocks());

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  it('registers its delivery activity', () => {
    service.onModuleInit();
    expect(durable.activity).toHaveBeenCalledWith(
      ACTIVITY.deliverWebhook,
      expect.any(Function),
    );
  });

  it('hands notify to a durable workflow instead of posting in memory', async () => {
    service.notify('t1', 'tenant.active');
    await flush();

    const [type, input, id] = durable.start.mock.calls[0] as [
      string,
      { tenantId: string; event: string; deliveryId: string },
      string,
    ];
    expect(type).toBe(TENANT_WEBHOOK_WORKFLOW);
    expect(input).toMatchObject({ tenantId: 't1', event: 'tenant.active' });
    expect(id).toBe(`liftoff-webhook-${input.deliveryId}`);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('falls back to delivering in memory when the engine refuses', async () => {
    durable.start.mockResolvedValue(false);

    service.notify('t1', 'tenant.active');
    await flush();
    await flush();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  describe('deliverAttempt', () => {
    const input = {
      tenantId: 't1',
      event: 'tenant.active' as const,
      deliveryId: 'd-1',
    };

    it('posts once, under the workflow delivery id', async () => {
      await expect(service.deliverAttempt(input)).resolves.toEqual({
        delivered: true,
        status: 200,
      });
      const [, init] = fetchImpl.mock.calls[0] as [
        URL,
        { headers: Record<string, string> },
      ];
      expect(init.headers['x-liftoff-delivery']).toBe('d-1');
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('throws on a 5xx, so the engine retries it', async () => {
      fetchImpl.mockResolvedValue(response(503));
      await expect(service.deliverAttempt(input)).rejects.toThrow(
        'answered 503',
      );
    });

    it('settles on a 4xx without retrying', async () => {
      fetchImpl.mockResolvedValue(response(410));
      await expect(service.deliverAttempt(input)).resolves.toEqual({
        delivered: false,
        status: 410,
        error: 'rejected with 410',
      });
    });

    it('is skipped when the organisation has no webhook', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        ...tenantRow,
        organisation: { webhookUrl: null, webhookSecret: null },
      });
      await expect(service.deliverAttempt(input)).resolves.toEqual({
        delivered: false,
        skipped: true,
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  it('settle() throws for a retryable attempt and answers otherwise', () => {
    expect(() =>
      settle({ delivered: false, retryable: true, error: 'timeout' }),
    ).toThrow('timeout');
    expect(settle({ delivered: true, retryable: false, status: 200 })).toEqual({
      delivered: true,
      status: 200,
    });
  });
});
