import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hostname } from 'os';
import type {
  ActivityFunction,
  ActivityTask,
  Payload,
  Worker,
} from 'workflowd';
import { errorMessage } from '../common/error-message';
import { WORKFLOWS } from './workflows';

type WorkflowdSdk = typeof import('workflowd');

// The SDK is only needed when WORKFLOWD_ADDR is set, so it is loaded on first use.
export const loadWorkflowd = (): WorkflowdSdk =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('workflowd') as WorkflowdSdk;

// Fails an activity's step at once, without retries. Only activities call it, and they
// run only once the worker has loaded the SDK.
export const nonRetryable = (message: string): Error =>
  new (loadWorkflowd().NonRetryableError)(message);

const RESTART_DELAY_MS = 5_000;

@Injectable()
export class DurableService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DurableService.name);
  private readonly address: string;
  private readonly token: string | undefined;
  private readonly activities = new Map<string, ActivityFunction>();
  private worker?: Worker;
  private stopped = false;
  // Replaced in tests.
  load: () => WorkflowdSdk = loadWorkflowd;

  constructor(config: ConfigService) {
    this.address = config.get<string>('WORKFLOWD_ADDR')?.trim() ?? '';
    this.token = config.get<string>('WORKFLOWD_TOKEN')?.trim() || undefined;
  }

  get enabled(): boolean {
    return this.address !== '';
  }

  // Services register the activities they own during onModuleInit, before the worker starts.
  activity(
    name: string,
    fn: (input: unknown, task: ActivityTask) => Promise<unknown>,
  ): void {
    this.activities.set(name, fn);
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      return;
    }
    const { Worker } = this.load();
    const worker = new Worker({
      address: this.address,
      token: this.token,
      workerId: `liftoff-tenant-${hostname()}`,
      sdk: 'liftoff-tenant-service',
    });
    for (const [type, fn] of Object.entries(WORKFLOWS)) {
      worker.workflow(type, fn);
    }
    for (const [name, fn] of this.activities) {
      worker.activity(name, fn, { as: 'json' });
    }
    this.worker = worker;
    void this.serve(worker);
    this.logger.log(
      `Durable deliveries on: webhooks and custom steps run on workflowd at ${this.address}`,
    );
  }

  onModuleDestroy(): void {
    this.stopped = true;
    this.worker?.stop();
  }

  // run() gives up if the engine is unreachable at start; keep trying until shutdown.
  private async serve(worker: Worker): Promise<void> {
    while (!this.stopped) {
      try {
        await worker.run();
        return;
      } catch (error) {
        this.logger.warn(
          `workflowd worker stopped: ${errorMessage(error)}; retrying in ${RESTART_DELAY_MS / 1000}s`,
        );
        await new Promise((resolve) => setTimeout(resolve, RESTART_DELAY_MS));
      }
    }
  }

  // False when durable deliveries are off or the engine refused, so the caller falls
  // back to delivering in memory.
  async start(
    workflowType: string,
    input: Payload,
    workflowId: string,
  ): Promise<boolean> {
    if (!this.worker) {
      return false;
    }
    try {
      await this.worker.startWorkflow(workflowType, input, workflowId);
      return true;
    } catch (error) {
      this.logger.warn(
        `Could not start ${workflowType} ${workflowId} on workflowd, delivering in memory instead: ${errorMessage(error)}`,
      );
      return false;
    }
  }

  // Best effort: the database already holds the result, the signal only ends a wait.
  async signal(
    workflowId: string,
    name: string,
    payload: Payload,
    requestId: string,
  ): Promise<void> {
    if (!this.worker) {
      return;
    }
    try {
      await this.worker.signal(workflowId, name, payload, { requestId });
    } catch (error) {
      this.logger.debug(
        `Signal ${name} to ${workflowId} not delivered: ${errorMessage(error)}`,
      );
    }
  }
}
