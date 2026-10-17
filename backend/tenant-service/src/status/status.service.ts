import { Injectable, NotFoundException } from '@nestjs/common';
import { StepStatus, TenantStatus } from '.prisma/tenant-client';
import type {
  PublicStepState,
  PublicTenantState,
  PublicTenantStatus,
} from '@liftoff/shared-types';
import { PrismaService } from '../prisma.service';
import { tenantAddress } from '../tenants/address';
import { hashStatusToken } from './status-token';

// Second person: the reader is the company's customer, waiting for their workspace.
const STEPS: { key: StepKey; name: string }[] = [
  { key: 'dbStatus', name: 'Creating your database' },
  { key: 'dnsStatus', name: 'Setting up your address' },
  { key: 'credentialsStatus', name: 'Generating your API keys' },
  { key: 'billingStatus', name: 'Starting your trial' },
  { key: 'notificationStatus', name: 'Finishing up' },
];

type StepKey =
  | 'dbStatus'
  | 'dnsStatus'
  | 'credentialsStatus'
  | 'billingStatus'
  | 'notificationStatus';

const STEP_STATE: Record<StepStatus, PublicStepState> = {
  PENDING: 'waiting',
  IN_PROGRESS: 'in-progress',
  SUCCESS: 'done',
  SKIPPED: 'skipped',
  FAILED: 'failed',
  CANCELLED: 'stopped',
};

const TENANT_STATE: Record<TenantStatus, PublicTenantState> = {
  PROVISIONING: 'setting-up',
  ACTIVE: 'ready',
  FAILED: 'needs-attention',
  SUSPENDED: 'stopped',
  CANCELLED: 'stopped',
  DEPROVISIONING: 'removed',
  DELETED: 'removed',
};

export interface StatusRow extends Record<StepKey, StepStatus> {
  name: string;
  subdomain: string;
  status: TenantStatus;
  updatedAt: Date;
  organisation: { name: string; baseDomain: string | null } | null;
}

export const PUBLIC_STATUS_SELECT = {
  name: true,
  subdomain: true,
  status: true,
  dbStatus: true,
  dnsStatus: true,
  credentialsStatus: true,
  billingStatus: true,
  notificationStatus: true,
  updatedAt: true,
  organisation: { select: { name: true, baseDomain: true } },
} as const;

// Nothing in here names a system: no ids, no routing keys, no schema, no step columns.
export function toPublicStatus(row: StatusRow): PublicTenantStatus {
  const steps = STEPS.map(({ key, name }) => ({
    name,
    state: STEP_STATE[row[key]],
  }));
  const state = TENANT_STATE[row.status];
  return {
    company: row.organisation?.name ?? '',
    name: row.name,
    state,
    done: steps.filter((s) => s.state === 'done' || s.state === 'skipped')
      .length,
    total: steps.length,
    steps,
    address:
      state === 'ready'
        ? tenantAddress(row.subdomain, row.organisation?.baseDomain)
        : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class StatusService {
  constructor(private readonly prisma: PrismaService) {}

  async publicStatus(token: string): Promise<PublicTenantStatus> {
    const row = await this.prisma.tenant.findUnique({
      where: { statusTokenHash: hashStatusToken(token) },
      select: PUBLIC_STATUS_SELECT,
    });
    if (!row) {
      throw new NotFoundException('No setup matches this link');
    }
    return toPublicStatus(row);
  }
}
