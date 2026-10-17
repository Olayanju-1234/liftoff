import {
  AmqpConnection,
  Nack,
  RABBIT_HANDLER,
} from '@golevelup/nestjs-rabbitmq';
import type { TenantDbReadyPayload } from '@liftoff/shared-types';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;
  let amqp: { publish: jest.Mock };

  const payload: TenantDbReadyPayload = {
    tenantId: 'tenant-1',
    subdomain: 'acme',
    planId: 'starter',
  };

  // The handler waits 2s to simulate creating the DNS record.
  const handle = async () => {
    const result = service.handleTenantDbReady(payload);
    await jest.advanceTimersByTimeAsync(2000);
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

  it('consumes dns-provisioner-queue, unbound, with a dead-letter exchange', () => {
    // SetMetadata stores method metadata on the function itself.
    const handler: unknown = Object.getOwnPropertyDescriptor(
      AppService.prototype,
      'handleTenantDbReady',
    )?.value;
    const config: unknown = Reflect.getMetadata(
      RABBIT_HANDLER,
      handler as object,
    );

    expect(config).toMatchObject({
      type: 'subscribe',
      queue: 'dns-provisioner-queue',
      queueOptions: { deadLetterExchange: 'dlx.provisioning' },
    });

    // tenant-service sends the input to the queue; a binding would run the step twice.
    expect(config).not.toHaveProperty('exchange');
    expect(config).not.toHaveProperty('routingKey');
  });

  it('publishes tenant.dns.ready with the tenant id, subdomain and plan', async () => {
    await expect(handle()).resolves.toBeUndefined();

    expect(amqp.publish).toHaveBeenCalledTimes(1);
    expect(amqp.publish).toHaveBeenCalledWith(
      'provisioning.direct',
      'tenant.dns.ready',
      { tenantId: 'tenant-1', subdomain: 'acme', planId: 'starter' },
    );
  });

  it('carries the test flag on to tenant.dns.ready', async () => {
    const result = service.handleTenantDbReady({ ...payload, test: true });
    await jest.advanceTimersByTimeAsync(2000);
    await expect(result).resolves.toBeUndefined();

    expect(amqp.publish).toHaveBeenCalledWith(
      'provisioning.direct',
      'tenant.dns.ready',
      {
        tenantId: 'tenant-1',
        subdomain: 'acme',
        planId: 'starter',
        test: true,
      },
    );
  });

  it('nacks without requeue when publishing fails, so the message dead-letters', async () => {
    amqp.publish.mockRejectedValueOnce(new Error('channel closed'));

    const result = await handle();

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
  });
});
