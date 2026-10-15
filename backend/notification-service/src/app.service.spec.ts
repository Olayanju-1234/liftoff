import {
  AmqpConnection,
  Nack,
  RABBIT_HANDLER,
} from '@golevelup/nestjs-rabbitmq';
import type { TenantBillingActivePayload } from '@liftoff/shared-types';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;
  let amqp: { publish: jest.Mock };

  const payload: TenantBillingActivePayload = {
    tenantId: 'tenant-1',
    subdomain: 'acme',
    planId: 'starter',
    stripeCustomerId: 'cus_123',
    stripeSubscriptionId: 'sub_123',
    subscriptionStatus: 'trialing',
    trialEnd: null,
  };

  // The handler waits 500ms to simulate sending the email.
  const handle = async () => {
    const result = service.handleTenantBillingActive(payload);
    await jest.advanceTimersByTimeAsync(500);
    return result;
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    amqp = { publish: jest.fn().mockResolvedValue(true) };

    const moduleRef = await Test.createTestingModule({
      providers: [AppService, { provide: AmqpConnection, useValue: amqp }],
    }).compile();

    service = moduleRef.get(AppService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('subscribes to tenant.billing.active with a dead-letter exchange', () => {
    // SetMetadata stores method metadata on the function itself.
    const handler: unknown = Object.getOwnPropertyDescriptor(
      AppService.prototype,
      'handleTenantBillingActive',
    )?.value;
    const config: unknown = Reflect.getMetadata(
      RABBIT_HANDLER,
      handler as object,
    );

    expect(config).toMatchObject({
      type: 'subscribe',
      exchange: 'provisioning.direct',
      routingKey: 'tenant.billing.active',
      queueOptions: { deadLetterExchange: 'dlx.provisioning' },
    });
  });

  it('publishes tenant.provisioning.complete with the tenant id and subdomain', async () => {
    await expect(handle()).resolves.toBeUndefined();

    expect(amqp.publish).toHaveBeenCalledTimes(1);
    expect(amqp.publish).toHaveBeenCalledWith(
      'provisioning.direct',
      'tenant.provisioning.complete',
      { tenantId: 'tenant-1', subdomain: 'acme' },
    );
  });

  it('nacks without requeue when publishing fails, so the message dead-letters', async () => {
    amqp.publish.mockRejectedValueOnce(new Error('channel closed'));

    const result = await handle();

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
  });
});
