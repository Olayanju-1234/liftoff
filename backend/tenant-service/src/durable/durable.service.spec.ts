import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { NonRetryableError } from 'workflowd';
import { DurableService, loadWorkflowd, nonRetryable } from './durable.service';
import { WORKFLOWS } from './workflows';

const config = (env: Record<string, string>) =>
  ({ get: (key: string) => env[key] }) as unknown as ConfigService;

// Records what the service asks of the SDK's Worker.
class FakeWorker {
  static last: FakeWorker;
  workflows: string[] = [];
  activities: Array<{ name: string; opts: unknown }> = [];
  activityFns = new Map<string, (input: unknown, task: unknown) => unknown>();
  run = jest.fn(() => Promise.resolve());
  stop = jest.fn();
  startWorkflow = jest.fn<Promise<string>, unknown[]>(() =>
    Promise.resolve('wf'),
  );
  signal = jest.fn<Promise<void>, unknown[]>(() => Promise.resolve());

  constructor(readonly options: Record<string, unknown>) {
    FakeWorker.last = this;
  }
  workflow(type: string) {
    this.workflows.push(type);
    return this;
  }
  activity(
    name: string,
    fn: (input: unknown, task: unknown) => unknown,
    opts: unknown,
  ) {
    this.activities.push({ name, opts });
    this.activityFns.set(name, fn);
    return this;
  }
}

const enabledService = (env: Record<string, string> = {}) => {
  const service = new DurableService(
    config({
      WORKFLOWD_ADDR: 'http://127.0.0.1:8233',
      WORKFLOWD_TOKEN: 'tok',
      ...env,
    }),
  );
  service.load = () =>
    ({ Worker: FakeWorker }) as unknown as ReturnType<DurableService['load']>;
  return service;
};

describe('DurableService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  describe('without WORKFLOWD_ADDR', () => {
    it('stays off, never loads the SDK, and reports nothing started', async () => {
      const service = new DurableService(config({}));
      const load = jest.fn();
      service.load = load;

      service.onApplicationBootstrap();

      expect(service.enabled).toBe(false);
      expect(load).not.toHaveBeenCalled();
      await expect(service.start('x', {}, 'id')).resolves.toBe(false);
      await expect(
        service.signal('id', 'callback', {}, 'r'),
      ).resolves.toBeUndefined();
    });
  });

  describe('with WORKFLOWD_ADDR', () => {
    it('registers every workflow and activity, then starts serving', () => {
      const service = enabledService();
      service.activity('liftoff.demo', () => Promise.resolve(true));

      service.onApplicationBootstrap();

      const worker = FakeWorker.last;
      expect(service.enabled).toBe(true);
      expect(worker.options).toMatchObject({
        address: 'http://127.0.0.1:8233',
        token: 'tok',
        namespace: 'default',
      });
      expect(worker.workflows.sort()).toEqual(Object.keys(WORKFLOWS).sort());
      expect(worker.activities).toEqual([
        { name: 'liftoff.demo', opts: { as: 'json' } },
      ]);
      expect(worker.run).toHaveBeenCalled();
    });

    it('works in WORKFLOWD_NAMESPACE when set, and says so', () => {
      const log = jest.spyOn(Logger.prototype, 'log');
      const service = enabledService({ WORKFLOWD_NAMESPACE: ' liftoff ' });

      service.onApplicationBootstrap();

      expect(FakeWorker.last.options).toMatchObject({ namespace: 'liftoff' });
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('namespace liftoff'),
      );
    });

    it('hands each activity its task, for the attempt number and a stable id', async () => {
      const service = enabledService();
      const fn = jest.fn(() => Promise.resolve('ok'));
      service.activity('liftoff.demo', fn);
      service.onApplicationBootstrap();
      const task = { activityId: 'wf-1/1', attempt: 2 };

      await FakeWorker.last.activityFns.get('liftoff.demo')!({ a: 1 }, task);

      expect(fn).toHaveBeenCalledWith({ a: 1 }, task);
    });

    it('starts a workflow under the given id', async () => {
      const service = enabledService();
      service.onApplicationBootstrap();

      await expect(
        service.start('liftoff.tenant-webhook', { a: 1 }, 'wf-1'),
      ).resolves.toBe(true);
      expect(FakeWorker.last.startWorkflow).toHaveBeenCalledWith(
        'liftoff.tenant-webhook',
        { a: 1 },
        'wf-1',
      );
    });

    it('reports false when the engine refuses, so the caller can fall back', async () => {
      const service = enabledService();
      service.onApplicationBootstrap();
      FakeWorker.last.startWorkflow.mockRejectedValueOnce(
        new Error('connect ECONNREFUSED'),
      );

      await expect(service.start('x', {}, 'wf-1')).resolves.toBe(false);
    });

    it('signals with an idempotency key and never throws', async () => {
      const service = enabledService();
      service.onApplicationBootstrap();
      FakeWorker.last.signal.mockRejectedValueOnce(new Error('404'));

      await expect(
        service.signal(
          'wf-1',
          'callback',
          { outcome: 'SUCCESS' },
          'c1:SUCCESS',
        ),
      ).resolves.toBeUndefined();
      expect(FakeWorker.last.signal).toHaveBeenCalledWith(
        'wf-1',
        'callback',
        { outcome: 'SUCCESS' },
        { requestId: 'c1:SUCCESS' },
      );
    });

    it('stops the worker on shutdown', () => {
      const service = enabledService();
      service.onApplicationBootstrap();

      service.onModuleDestroy();

      expect(FakeWorker.last.stop).toHaveBeenCalled();
    });
  });
});

describe('the workflowd SDK', () => {
  it("loads through require, from the package's CommonJS build", () => {
    expect(typeof loadWorkflowd().Worker).toBe('function');
  });

  it('marks an activity failure as final with its own NonRetryableError', () => {
    const error = nonRetryable('rejected with 400');

    expect(error).toBeInstanceOf(NonRetryableError);
    expect(error).toMatchObject({
      message: 'rejected with 400',
      nonRetryable: true,
    });
  });
});
