import { Logger } from '@nestjs/common';
import type { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import {
  LEGACY_STEP_BINDINGS,
  StepBindingsService,
  type BrokerConnection,
} from './step-bindings.service';

describe('StepBindingsService', () => {
  const channel = () => ({
    on: jest.fn(),
    unbindQueue: jest.fn().mockResolvedValue({}),
    close: jest.fn().mockResolvedValue(undefined),
  });

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it("removes every worker's old binding to the previous step's result", () => {
    expect(LEGACY_STEP_BINDINGS).toEqual([
      { queue: 'db-provisioner-queue', routingKey: 'tenant.requested' },
      { queue: 'dns-provisioner-queue', routingKey: 'tenant.db.ready' },
      { queue: 'credentials-queue', routingKey: 'tenant.dns.ready' },
      { queue: 'billing-queue', routingKey: 'tenant.credentials.ready' },
      { queue: 'notification-queue', routingKey: 'tenant.billing.active' },
    ]);
  });

  it('unbinds each from provisioning.direct on a channel of its own, and closes it', async () => {
    const channels = LEGACY_STEP_BINDINGS.map(channel);
    const connection: BrokerConnection = {
      createChannel: jest.fn(() => Promise.resolve(channels.shift()!)),
    };
    const opened = [...channels];

    await expect(
      new StepBindingsService({} as AmqpConnection).removeLegacyBindings(
        connection,
      ),
    ).resolves.toBe(5);

    expect(opened[1].unbindQueue).toHaveBeenCalledWith(
      'dns-provisioner-queue',
      'provisioning.direct',
      'tenant.db.ready',
    );
    opened.forEach((ch) => {
      expect(ch.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(ch.close).toHaveBeenCalled();
    });
  });

  it('keeps going when a queue does not exist yet', async () => {
    const missing = channel();
    missing.unbindQueue.mockRejectedValueOnce(new Error('NOT_FOUND'));
    missing.close.mockRejectedValueOnce(new Error('channel closed'));
    const rest = [1, 2, 3, 4].map(channel);
    const connection: BrokerConnection = {
      createChannel: jest
        .fn()
        .mockResolvedValueOnce(missing)
        .mockImplementation(() => Promise.resolve(rest.shift())),
    };

    await expect(
      new StepBindingsService({} as AmqpConnection).removeLegacyBindings(
        connection,
      ),
    ).resolves.toBe(4);
  });

  it('runs on every connect, and at once when already connected', () => {
    const on = jest.fn();
    const amqp = {
      managedConnection: { on },
      connected: true,
      connection: { createChannel: jest.fn().mockResolvedValue(channel()) },
    } as unknown as AmqpConnection;
    const service = new StepBindingsService(amqp);
    const remove = jest
      .spyOn(service, 'removeLegacyBindings')
      .mockResolvedValue(5);

    service.onApplicationBootstrap();
    const [[event, listener]] = on.mock.calls as [
      [string, (arg: { connection: BrokerConnection }) => void],
    ];
    const reconnected = { createChannel: jest.fn() };
    listener({ connection: reconnected });

    expect(event).toBe('connect');
    expect(remove).toHaveBeenNthCalledWith(1, amqp.connection);
    expect(remove).toHaveBeenNthCalledWith(2, reconnected);
  });
});
