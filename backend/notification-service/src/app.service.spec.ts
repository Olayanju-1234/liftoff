import {
  AmqpConnection,
  Nack,
  RABBIT_HANDLER,
} from '@golevelup/nestjs-rabbitmq';
import type {
  InternalTenantNotification,
  TenantBillingActivePayload,
  TenantFailedPayload,
} from '@liftoff/shared-types';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { AppService } from './app.service';
import { EmailService } from './email.service';
import { InternalApiClient } from './internal-api.client';

describe('AppService', () => {
  let service: AppService;
  let amqp: { publish: jest.Mock };
  let email: { enabled: boolean; send: jest.Mock };
  let internalApi: { configured: boolean; notificationDetails: jest.Mock };

  const payload: TenantBillingActivePayload = {
    tenantId: 'tenant-1',
    subdomain: 'globex',
    planId: 'starter',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: 'skipped',
    trialEnd: null,
    skipped: true,
    skipReason: 'not-connected',
  };

  const details: InternalTenantNotification = {
    tenant: {
      id: 'tenant-1',
      name: 'Globex <Inc>',
      subdomain: 'globex',
      address: 'globex.acme.app',
      planId: 'starter',
      status: 'PROVISIONING',
      isTest: false,
    },
    organisation: { id: 'org-1', name: 'Acme' },
    recipients: {
      ready: ['ops@acme.com', 'ceo@acme.com'],
      attention: ['ops@acme.com'],
    },
  };

  const metadataOf = (method: string): Record<string, unknown> => {
    // SetMetadata stores method metadata on the function itself.
    const handler: unknown = Object.getOwnPropertyDescriptor(
      AppService.prototype,
      method,
    )?.value;
    return Reflect.getMetadata(RABBIT_HANDLER, handler as object) as Record<
      string,
      unknown
    >;
  };

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    amqp = { publish: jest.fn().mockResolvedValue(true) };
    email = { enabled: true, send: jest.fn().mockResolvedValue(undefined) };
    internalApi = {
      configured: true,
      notificationDetails: jest.fn().mockResolvedValue(details),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AppService,
        { provide: AmqpConnection, useValue: amqp },
        { provide: EmailService, useValue: email },
        { provide: InternalApiClient, useValue: internalApi },
        {
          provide: ConfigService,
          useValue: { get: () => 'https://liftoff.example/' },
        },
      ],
    }).compile();

    service = moduleRef.get(AppService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('consumes notification-queue, unbound, with a dead-letter exchange, and subscribes to tenant.failed without one', () => {
    expect(metadataOf('handleTenantBillingActive')).toMatchObject({
      type: 'subscribe',
      queue: 'notification-queue',
      queueOptions: { deadLetterExchange: 'dlx.provisioning' },
    });
    // tenant-service sends the input to the queue; a binding would run the step twice.
    expect(metadataOf('handleTenantBillingActive')).not.toHaveProperty(
      'exchange',
    );
    expect(metadataOf('handleTenantBillingActive')).not.toHaveProperty(
      'routingKey',
    );
    const failed = metadataOf('handleTenantFailed');
    expect(failed).toMatchObject({
      type: 'subscribe',
      exchange: 'provisioning.direct',
      routingKey: 'tenant.failed',
      queue: 'notification-failed-queue',
    });
    expect(failed.queueOptions).not.toHaveProperty('deadLetterExchange');
  });

  describe('tenant.billing.active', () => {
    it('emails the company "<Customer> is ready" and publishes provisioning.complete as sent', async () => {
      await expect(
        service.handleTenantBillingActive(payload),
      ).resolves.toBeUndefined();

      expect(internalApi.notificationDetails).toHaveBeenCalledWith('tenant-1');
      expect(email.send).toHaveBeenCalledTimes(1);
      const [[mail]] = email.send.mock.calls as [
        [{ to: string[]; subject: string; html: string; text: string }],
      ];
      expect(mail.to).toEqual(['ops@acme.com', 'ceo@acme.com']);
      expect(mail.subject).toBe('Globex <Inc> is ready');
      expect(mail.html).toContain('Globex &lt;Inc&gt;');
      expect(mail.html).not.toContain('<Inc>');
      expect(mail.html).toContain('globex.acme.app');
      expect(mail.html).toContain('https://liftoff.example/customers/tenant-1');
      expect(mail.text).toContain('tenant.active webhook');
      expect(amqp.publish).toHaveBeenCalledWith(
        'provisioning.direct',
        'tenant.provisioning.complete',
        {
          tenantId: 'tenant-1',
          subdomain: 'globex',
          notification: { sent: true, recipients: 2 },
        },
      );
    });

    it('marks a test tenant in the subject', async () => {
      internalApi.notificationDetails.mockResolvedValueOnce({
        ...details,
        tenant: { ...details.tenant, isTest: true },
      });

      await service.handleTenantBillingActive({ ...payload, test: true });

      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Globex <Inc> is ready (test)' }),
      );
    });

    it.each(['CANCELLED', 'DEPROVISIONING', 'DELETED'])(
      'sends nothing and publishes nothing when the tenant is %s by the time billing finishes',
      async (status) => {
        const debug = jest
          .spyOn(Logger.prototype, 'debug')
          .mockImplementation(() => undefined);
        internalApi.notificationDetails.mockResolvedValueOnce({
          ...details,
          tenant: { ...details.tenant, status },
        });

        await expect(
          service.handleTenantBillingActive(payload),
        ).resolves.toBeUndefined();

        expect(email.send).not.toHaveBeenCalled();
        expect(amqp.publish).not.toHaveBeenCalled();
        expect(debug).toHaveBeenCalledWith(
          expect.stringContaining(`tenant tenant-1: it is ${status}`),
        );
      },
    );

    it.each(['FAILED', 'ACTIVE'])(
      'still emails a %s tenant (a replayed step, or a result handled late)',
      async (status) => {
        internalApi.notificationDetails.mockResolvedValueOnce({
          ...details,
          tenant: { ...details.tenant, status },
        });

        await service.handleTenantBillingActive(payload);

        expect(email.send).toHaveBeenCalledTimes(1);
        expect(amqp.publish).toHaveBeenCalledTimes(1);
      },
    );

    it('completes the saga as not sent (no-provider) without asking tenant-service when no email provider is set', async () => {
      email.enabled = false;

      await expect(
        service.handleTenantBillingActive(payload),
      ).resolves.toBeUndefined();

      expect(internalApi.notificationDetails).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
      expect(amqp.publish).toHaveBeenCalledWith(
        'provisioning.direct',
        'tenant.provisioning.complete',
        expect.objectContaining({
          notification: {
            sent: false,
            recipients: 0,
            skipReason: 'no-provider',
          },
        }),
      );
    });

    it('completes as not-configured when the internal API is not set up', async () => {
      internalApi.configured = false;

      await service.handleTenantBillingActive(payload);

      expect(amqp.publish).toHaveBeenCalledWith(
        'provisioning.direct',
        'tenant.provisioning.complete',
        expect.objectContaining({
          notification: {
            sent: false,
            recipients: 0,
            skipReason: 'not-configured',
          },
        }),
      );
    });

    it('completes as no-recipient when nobody in the company can be emailed', async () => {
      internalApi.notificationDetails.mockResolvedValueOnce({
        ...details,
        recipients: { ready: [], attention: [] },
      });

      await service.handleTenantBillingActive(payload);

      expect(email.send).not.toHaveBeenCalled();
      expect(amqp.publish).toHaveBeenCalledWith(
        'provisioning.direct',
        'tenant.provisioning.complete',
        expect.objectContaining({
          notification: {
            sent: false,
            recipients: 0,
            skipReason: 'no-recipient',
          },
        }),
      );
    });

    it('nacks without requeue when tenant-service cannot be reached, so the step is FAILED and retryable', async () => {
      internalApi.notificationDetails.mockRejectedValueOnce(
        new Error('tenant-service answered 503'),
      );

      const result = await service.handleTenantBillingActive(payload);

      expect(result).toBeInstanceOf(Nack);
      expect((result as Nack).requeue).toBe(false);
      expect(amqp.publish).not.toHaveBeenCalled();
    });

    it('nacks without requeue when the provider refuses the email', async () => {
      email.send.mockRejectedValueOnce(new Error('validation_error'));

      const result = await service.handleTenantBillingActive(payload);

      expect(result).toBeInstanceOf(Nack);
      expect(amqp.publish).not.toHaveBeenCalled();
    });

    it('nacks without requeue when publishing fails, so the message dead-letters', async () => {
      amqp.publish.mockRejectedValueOnce(new Error('channel closed'));

      const result = await service.handleTenantBillingActive(payload);

      expect(result).toBeInstanceOf(Nack);
      expect((result as Nack).requeue).toBe(false);
    });
  });

  describe('tenant.failed', () => {
    const failed: TenantFailedPayload = {
      tenantId: 'tenant-1',
      step: 'billingStatus',
      error: 'billing-queue rejected tenant.credentials.ready',
    };

    it('emails the failed-job recipients "<Customer> needs attention" with the step and error', async () => {
      await expect(service.handleTenantFailed(failed)).resolves.toBeUndefined();

      const [[mail]] = email.send.mock.calls as [
        [{ to: string[]; subject: string; html: string; text: string }],
      ];
      expect(mail.to).toEqual(['ops@acme.com']);
      expect(mail.subject).toBe('Globex <Inc> needs attention');
      expect(mail.text).toContain('starting their trial');
      expect(mail.text).toContain('billing-queue rejected');
      expect(mail.html).toContain('https://liftoff.example/customers/tenant-1');
      expect(amqp.publish).not.toHaveBeenCalled();
    });

    it('sends nothing when nobody has failed-job alerts on', async () => {
      internalApi.notificationDetails.mockResolvedValueOnce({
        ...details,
        recipients: { ready: ['ops@acme.com'], attention: [] },
      });

      await expect(service.handleTenantFailed(failed)).resolves.toBeUndefined();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('sends nothing when the tenant was removed between failing and this message', async () => {
      internalApi.notificationDetails.mockResolvedValueOnce({
        ...details,
        tenant: { ...details.tenant, status: 'DELETED' },
      });

      await expect(service.handleTenantFailed(failed)).resolves.toBeUndefined();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('does nothing without an email provider', async () => {
      email.enabled = false;

      await expect(service.handleTenantFailed(failed)).resolves.toBeUndefined();
      expect(internalApi.notificationDetails).not.toHaveBeenCalled();
    });

    it('nacks without requeue when the email cannot be sent', async () => {
      email.send.mockRejectedValueOnce(new Error('boom'));

      const result = await service.handleTenantFailed(failed);

      expect(result).toBeInstanceOf(Nack);
      expect((result as Nack).requeue).toBe(false);
    });
  });
});
