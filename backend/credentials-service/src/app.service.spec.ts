import {
  AmqpConnection,
  Nack,
  RABBIT_HANDLER,
} from '@golevelup/nestjs-rabbitmq';
import type { TenantDnsReadyPayload } from '@liftoff/shared-types';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '.prisma/credentials-client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

import { AppService } from './app.service';
import { PrismaService } from './prisma.service';

describe('AppService', () => {
  let service: AppService;
  let amqp: { publish: jest.Mock };
  let prisma: {
    credential: {
      create: jest.Mock<Promise<unknown>, [Prisma.CredentialCreateArgs]>;
    };
  };

  const payload: TenantDnsReadyPayload = {
    tenantId: 'tenant-1',
    subdomain: 'acme',
    planId: 'starter',
  };

  const uniqueViolation = () =>
    new PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: Prisma.prismaVersion.client,
    });

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    amqp = { publish: jest.fn().mockResolvedValue(true) };
    prisma = {
      credential: {
        create: jest
          .fn<Promise<unknown>, [Prisma.CredentialCreateArgs]>()
          .mockResolvedValue({}),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AppService,
        { provide: AmqpConnection, useValue: amqp },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(AppService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('subscribes to tenant.dns.ready with a dead-letter exchange', () => {
    // SetMetadata stores method metadata on the function itself.
    const handler: unknown = Object.getOwnPropertyDescriptor(
      AppService.prototype,
      'handleTenantDnsReady',
    )?.value;
    const config: unknown = Reflect.getMetadata(
      RABBIT_HANDLER,
      handler as object,
    );

    expect(config).toMatchObject({
      type: 'subscribe',
      exchange: 'provisioning.direct',
      routingKey: 'tenant.dns.ready',
      queue: 'credentials-queue',
      queueOptions: { deadLetterExchange: 'dlx.provisioning' },
    });
  });

  it('stores a fresh API key for the tenant, then publishes tenant.credentials.ready', async () => {
    await expect(
      service.handleTenantDnsReady(payload),
    ).resolves.toBeUndefined();

    expect(prisma.credential.create).toHaveBeenCalledTimes(1);
    const { data } = prisma.credential.create.mock.calls[0][0];
    expect(data.tenantId).toBe('tenant-1');
    expect(data.apiKey).toMatch(/^sk_live_[0-9a-f]{48}$/);

    expect(amqp.publish).toHaveBeenCalledTimes(1);
    expect(amqp.publish).toHaveBeenCalledWith(
      'provisioning.direct',
      'tenant.credentials.ready',
      payload,
    );
  });

  it('generates a different key for each tenant', async () => {
    await service.handleTenantDnsReady(payload);
    await service.handleTenantDnsReady({ ...payload, tenantId: 'tenant-2' });

    const [first, second] = prisma.credential.create.mock.calls.map(
      ([args]) => args.data.apiKey,
    );
    expect(first).not.toBe(second);
  });

  it('republishes instead of failing when the tenant already has credentials', async () => {
    prisma.credential.create.mockRejectedValueOnce(uniqueViolation());

    await expect(
      service.handleTenantDnsReady(payload),
    ).resolves.toBeUndefined();

    expect(amqp.publish).toHaveBeenCalledTimes(1);
    expect(amqp.publish).toHaveBeenCalledWith(
      'provisioning.direct',
      'tenant.credentials.ready',
      payload,
    );
  });

  it('nacks without requeue and publishes nothing when storing credentials fails', async () => {
    prisma.credential.create.mockRejectedValueOnce(new Error('db down'));

    const result = await service.handleTenantDnsReady(payload);

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
    expect(amqp.publish).not.toHaveBeenCalled();
  });

  it('nacks without requeue when publishing fails, so the message dead-letters', async () => {
    amqp.publish.mockRejectedValueOnce(new Error('channel closed'));

    const result = await service.handleTenantDnsReady(payload);

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
  });
});
