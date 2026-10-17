import {
  AmqpConnection,
  Nack,
  RABBIT_HANDLER,
} from '@golevelup/nestjs-rabbitmq';
import type {
  TenantDeprovisionPayload,
  TenantRequestedPayload,
} from '@liftoff/shared-types';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppService } from './app.service';
import { PrismaService } from './prisma.service';

describe('AppService', () => {
  let service: AppService;
  let amqp: { publish: jest.Mock };
  let prisma: { $executeRawUnsafe: jest.Mock<Promise<number>, [string]> };

  const payload: TenantRequestedPayload = {
    tenantId: 'tenant-1',
    subdomain: 'acme',
    planId: 'starter',
  };

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    amqp = { publish: jest.fn().mockResolvedValue(true) };
    prisma = {
      $executeRawUnsafe: jest
        .fn<Promise<number>, [string]>()
        .mockResolvedValue(0),
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

  it('subscribes to tenant.requested with a dead-letter exchange', () => {
    // SetMetadata stores method metadata on the function itself.
    const handler: unknown = Object.getOwnPropertyDescriptor(
      AppService.prototype,
      'handleTenantRequested',
    )?.value;
    const config: unknown = Reflect.getMetadata(
      RABBIT_HANDLER,
      handler as object,
    );

    expect(config).toMatchObject({
      type: 'subscribe',
      exchange: 'provisioning.direct',
      routingKey: 'tenant.requested',
      queue: 'db-provisioner-queue',
      queueOptions: { deadLetterExchange: 'dlx.provisioning' },
    });
  });

  it('creates the tenant schema, then publishes tenant.db.ready', async () => {
    await expect(
      service.handleTenantRequested(payload),
    ).resolves.toBeUndefined();

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'CREATE SCHEMA IF NOT EXISTS "tenant_acme";',
    );
    expect(amqp.publish).toHaveBeenCalledTimes(1);
    expect(amqp.publish).toHaveBeenCalledWith(
      'provisioning.direct',
      'tenant.db.ready',
      { tenantId: 'tenant-1', subdomain: 'acme', planId: 'starter' },
    );
  });

  it('creates the schema tenant-service named, when the message carries one', async () => {
    await service.handleTenantRequested({
      ...payload,
      schemaName: 'tenant_acme_corp_acme',
    });

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'CREATE SCHEMA IF NOT EXISTS "tenant_acme_corp_acme";',
    );
    expect(amqp.publish).toHaveBeenCalledWith(
      'provisioning.direct',
      'tenant.db.ready',
      { tenantId: 'tenant-1', subdomain: 'acme', planId: 'starter' },
    );
  });

  it('carries the test flag on to tenant.db.ready', async () => {
    await service.handleTenantRequested({ ...payload, test: true });

    expect(amqp.publish).toHaveBeenCalledWith(
      'provisioning.direct',
      'tenant.db.ready',
      {
        tenantId: 'tenant-1',
        subdomain: 'acme',
        planId: 'starter',
        test: true,
      },
    );
  });

  it('reduces the subdomain to [A-Za-z0-9_] before it reaches the raw SQL', async () => {
    await service.handleTenantRequested({
      ...payload,
      subdomain: 'acme-co"; DROP SCHEMA public; --',
    });

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'CREATE SCHEMA IF NOT EXISTS "tenant_acme_co___DROP_SCHEMA_public____";',
    );
  });

  it('nacks without requeue and publishes nothing when the schema cannot be created', async () => {
    prisma.$executeRawUnsafe.mockRejectedValueOnce(
      new Error('permission denied'),
    );

    const result = await service.handleTenantRequested(payload);

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
    expect(amqp.publish).not.toHaveBeenCalled();
  });

  it('nacks without requeue when publishing fails, so the message dead-letters', async () => {
    amqp.publish.mockRejectedValueOnce(new Error('channel closed'));

    const result = await service.handleTenantRequested(payload);

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
  });

  describe('tenant.deprovision', () => {
    const deprovision: TenantDeprovisionPayload = {
      tenantId: 'tenant-1',
      subdomain: 'acme',
      schemaName: 'tenant_acme_corp_acme',
      stripeSubscriptionId: null,
      reason: 'Deleted by user',
    };

    it('subscribes on its own queue with its own dead-letter key', () => {
      const handler: unknown = Object.getOwnPropertyDescriptor(
        AppService.prototype,
        'handleTenantDeprovision',
      )?.value;
      expect(
        Reflect.getMetadata(RABBIT_HANDLER, handler as object),
      ).toMatchObject({
        exchange: 'provisioning.direct',
        routingKey: 'tenant.deprovision',
        queue: 'db-provisioner-deprovision-queue',
        queueOptions: {
          deadLetterExchange: 'dlx.provisioning',
          deadLetterRoutingKey: 'db-provisioner.deprovision.failed',
        },
      });
    });

    it('drops the schema idempotently and reports it', async () => {
      await expect(
        service.handleTenantDeprovision(deprovision),
      ).resolves.toBeUndefined();

      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        'DROP SCHEMA IF EXISTS "tenant_acme_corp_acme" CASCADE;',
      );
      expect(amqp.publish).toHaveBeenCalledWith(
        'provisioning.direct',
        'tenant.deprovision.done',
        {
          tenantId: 'tenant-1',
          part: 'db',
          skipped: false,
          detail: 'tenant_acme_corp_acme',
        },
      );
    });

    it('reports skipped without touching Postgres when there is no schema to drop', async () => {
      await service.handleTenantDeprovision({
        ...deprovision,
        schemaName: null,
      });

      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
      expect(amqp.publish).toHaveBeenCalledWith(
        'provisioning.direct',
        'tenant.deprovision.done',
        expect.objectContaining({ part: 'db', skipped: true }),
      );
    });

    it.each([
      'public',
      'credentials',
      'tenant_x"; DROP SCHEMA public; --',
      'tenant_',
    ])('refuses to drop %p and dead-letters instead', async (schemaName) => {
      const result = await service.handleTenantDeprovision({
        ...deprovision,
        schemaName,
      });

      expect(result).toBeInstanceOf(Nack);
      expect((result as Nack).requeue).toBe(false);
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
      expect(amqp.publish).not.toHaveBeenCalled();
    });

    it('nacks without requeue when Postgres fails', async () => {
      prisma.$executeRawUnsafe.mockRejectedValueOnce(new Error('lock timeout'));

      const result = await service.handleTenantDeprovision(deprovision);

      expect(result).toBeInstanceOf(Nack);
      expect(amqp.publish).not.toHaveBeenCalled();
    });
  });
});
