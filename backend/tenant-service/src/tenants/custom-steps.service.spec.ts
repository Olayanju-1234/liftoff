import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StepStatus, type CustomStepCall } from '.prisma/tenant-client';
import type { CustomStepRequest } from '@liftoff/shared-types';

import {
  CustomStepsService,
  DEFAULT_PUBLIC_API_URL,
} from './custom-steps.service';
import type { PrismaService } from '../prisma.service';
import type { WebhookService } from '../webhooks/webhook.service';

const call: CustomStepCall = {
  id: 'call-1',
  tenantId: 'ctenant00000000000000000001',
  step: 'address',
  action: 'provision',
  url: 'https://steps.acme.com/dns',
  status: StepStatus.IN_PROGRESS,
  deadlineAt: new Date('2026-10-17T18:10:00Z'),
  completedAt: null,
  error: null,
  output: null,
  createdAt: new Date('2026-10-17T18:00:00Z'),
};

describe('CustomStepsService', () => {
  let prisma: {
    tenant: { findUnique: jest.Mock };
    customStepCall: {
      create: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let webhooks: { post: jest.Mock; tenantRecord: jest.Mock };

  const build = (publicApiUrl?: string) =>
    new CustomStepsService(
      prisma as unknown as PrismaService,
      webhooks as unknown as WebhookService,
      { get: () => publicApiUrl } as unknown as ConfigService,
    );

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: call.tenantId,
          subdomain: 'globex',
          planId: 'starter',
          organisation: {
            webhookUrl: 'https://hooks.acme.com/liftoff',
            webhookSecret: 'whsec_test',
            baseDomain: null,
            plans: null,
          },
        }),
      },
      customStepCall: {
        create: jest.fn(({ data }: { data: object }) =>
          Promise.resolve({ ...call, ...data }),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    webhooks = {
      post: jest.fn().mockResolvedValue({ delivered: true }),
      tenantRecord: jest.fn((tenant: { id: string }) => ({ id: tenant.id })),
    };
  });

  afterEach(() => jest.restoreAllMocks());

  it('points callbacks at PUBLIC_API_URL, one path per step and one more for teardown', () => {
    const service = build('https://api.liftoff.example/');

    expect(service.callbackUrl('t1', 'billing', 'provision')).toBe(
      'https://api.liftoff.example/tenants/t1/steps/billing',
    );
    expect(service.callbackUrl('t1', 'billing', 'teardown')).toBe(
      'https://api.liftoff.example/tenants/t1/steps/billing/teardown',
    );
  });

  it('falls back to the local gateway and says so when PUBLIC_API_URL is unset', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn');

    expect(build().callbackUrl('t1', 'welcome', 'provision')).toBe(
      `${DEFAULT_PUBLIC_API_URL}/tenants/t1/steps/welcome`,
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('PUBLIC_API_URL is not set'),
    );
  });

  it('supersedes an open request for the same step before opening a new one with its deadline', async () => {
    const before = Date.now();

    const opened = await build('https://api.test').open(
      't1',
      'address',
      'provision',
      { url: 'https://steps.acme.com/dns', timeoutMs: 300_000 },
    );

    expect(prisma.customStepCall.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 't1',
        step: 'address',
        action: 'provision',
        status: StepStatus.IN_PROGRESS,
      },
      data: expect.objectContaining({
        status: StepStatus.CANCELLED,
        error: 'Superseded by a newer request',
      }) as unknown,
    });
    const deadline = opened.deadlineAt.getTime();
    expect(deadline).toBeGreaterThanOrEqual(before + 300_000);
    expect(deadline).toBeLessThan(Date.now() + 300_001);
  });

  it('signs the request with the webhook secret and stops retrying once the request is closed', async () => {
    const service = build('https://api.test');
    prisma.customStepCall.findUnique.mockResolvedValueOnce({
      status: StepStatus.SUCCESS,
    });

    await expect(service.send(call)).resolves.toEqual({ delivered: true });

    const [[post]] = webhooks.post.mock.calls as [
      [
        {
          url: URL;
          secret: string;
          event: string;
          body: string;
          stillWanted: () => Promise<boolean>;
        },
      ],
    ];
    expect(post.secret).toBe('whsec_test');
    expect(post.event).toBe('step.requested');
    expect(JSON.parse(post.body) as CustomStepRequest).toEqual({
      event: 'step.requested',
      step: 'address',
      requestId: 'call-1',
      callbackUrl: `https://api.test/tenants/${call.tenantId}/steps/address`,
      deadline: '2026-10-17T18:10:00.000Z',
      tenant: { id: call.tenantId },
    });
    await expect(post.stillWanted()).resolves.toBe(false);
  });

  it('sends step.teardown for a teardown request', async () => {
    await build('https://api.test').send({ ...call, action: 'teardown' });

    const [[post]] = webhooks.post.mock.calls as [[{ body: string }]];
    expect(JSON.parse(post.body)).toMatchObject({
      event: 'step.teardown',
      callbackUrl: `https://api.test/tenants/${call.tenantId}/steps/address/teardown`,
    });
  });

  it('sends nothing without a webhook secret to sign with', async () => {
    prisma.tenant.findUnique.mockResolvedValueOnce({
      id: call.tenantId,
      organisation: { webhookSecret: null },
    });

    const result = await build('https://api.test').send(call);

    expect(result.delivered).toBe(false);
    expect(result.error).toContain('no webhook secret');
    expect(webhooks.post).not.toHaveBeenCalled();
  });

  it('refuses a stored URL that points inside, without throwing', async () => {
    const result = await build('https://api.test').send({
      ...call,
      url: 'http://127.0.0.1:8080/steps',
    });

    expect(result).toMatchObject({ delivered: false });
    expect(result.error).toContain('public host');
    expect(webhooks.post).not.toHaveBeenCalled();
  });

  it('closes only a request that is still open', async () => {
    const service = build('https://api.test');
    prisma.customStepCall.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.close('call-1', StepStatus.SUCCESS, { output: { a: 1 } }),
    ).resolves.toBe(false);
    expect(prisma.customStepCall.updateMany).toHaveBeenCalledWith({
      where: { id: 'call-1', status: StepStatus.IN_PROGRESS },
      data: expect.objectContaining({
        status: StepStatus.SUCCESS,
        output: { a: 1 },
      }) as unknown,
    });
  });

  it('shows the latest request per step and action', async () => {
    prisma.customStepCall.findMany.mockResolvedValueOnce([
      { ...call, id: 'call-3', status: StepStatus.IN_PROGRESS },
      { ...call, id: 'call-2', action: 'teardown' },
      { ...call, id: 'call-1', status: StepStatus.FAILED },
    ]);

    const views = await build('https://api.test').forTenant(call.tenantId);

    expect(views.map((view) => [view.requestId, view.action])).toEqual([
      ['call-3', 'provision'],
      ['call-2', 'teardown'],
    ]);
  });
});
