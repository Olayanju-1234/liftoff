import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StepStatus, TenantStatus } from '.prisma/tenant-client';
import { PrismaService } from '../prisma.service';
import { hashStatusToken } from './status-token';
import {
  PUBLIC_STATUS_SELECT,
  StatusService,
  toPublicStatus,
} from './status.service';
import type { StatusRow } from './status.service';

const row: StatusRow = {
  name: 'Globex',
  subdomain: 'globex',
  status: TenantStatus.PROVISIONING,
  dbStatus: StepStatus.SUCCESS,
  dnsStatus: StepStatus.SUCCESS,
  credentialsStatus: StepStatus.IN_PROGRESS,
  billingStatus: StepStatus.PENDING,
  notificationStatus: StepStatus.PENDING,
  updatedAt: new Date('2026-10-17T10:00:00Z'),
  organisation: { name: 'Acme', baseDomain: 'acme.app' },
};

describe('public status', () => {
  describe('toPublicStatus', () => {
    it('says where setup is, in plain words, with a done count', () => {
      expect(toPublicStatus(row)).toEqual({
        company: 'Acme',
        name: 'Globex',
        state: 'setting-up',
        done: 2,
        total: 5,
        steps: [
          { name: 'Creating your database', state: 'done' },
          { name: 'Setting up your address', state: 'done' },
          { name: 'Generating your API keys', state: 'in-progress' },
          { name: 'Starting your trial', state: 'waiting' },
          { name: 'Finishing up', state: 'waiting' },
        ],
        address: null,
        updatedAt: '2026-10-17T10:00:00.000Z',
      });
    });

    it('is ready with the address once ACTIVE; a skipped step counts as finished', () => {
      const ready = toPublicStatus({
        ...row,
        status: TenantStatus.ACTIVE,
        credentialsStatus: StepStatus.SUCCESS,
        billingStatus: StepStatus.SKIPPED,
        notificationStatus: StepStatus.SUCCESS,
      });
      expect(ready).toMatchObject({
        state: 'ready',
        done: 5,
        address: 'globex.acme.app',
      });
      expect(ready.steps[3]).toEqual({
        name: 'Starting your trial',
        state: 'skipped',
      });
    });

    it.each([
      [TenantStatus.FAILED, 'needs-attention'],
      [TenantStatus.CANCELLED, 'stopped'],
      [TenantStatus.SUSPENDED, 'stopped'],
      [TenantStatus.DEPROVISIONING, 'removed'],
      [TenantStatus.DELETED, 'removed'],
    ])('maps %s to %s with no address', (status, state) => {
      const result = toPublicStatus({
        ...row,
        status,
        credentialsStatus: StepStatus.FAILED,
        billingStatus: StepStatus.CANCELLED,
      });
      expect(result.state).toBe(state);
      expect(result.address).toBeNull();
      expect(result.steps[2].state).toBe('failed');
      expect(result.steps[3].state).toBe('stopped');
    });

    it('names no system: no ids, step columns, routing keys or schema anywhere in the body', () => {
      const body = JSON.stringify(toPublicStatus(row));
      for (const leak of [
        'Status',
        'tenant.',
        'routingKey',
        'queue',
        'schema',
        'cuid',
        'Id"',
        'subdomain',
      ]) {
        expect(body).not.toContain(leak);
      }
    });

    it('copes with a legacy tenant that has no organisation', () => {
      expect(toPublicStatus({ ...row, organisation: null })).toMatchObject({
        company: '',
        state: 'setting-up',
      });
    });
  });

  describe('StatusService', () => {
    let service: StatusService;
    const prisma = { tenant: { findUnique: jest.fn() } };
    const token = 'A'.repeat(43);

    beforeEach(async () => {
      jest.resetAllMocks();
      const moduleRef = await Test.createTestingModule({
        providers: [
          StatusService,
          { provide: PrismaService, useValue: prisma },
        ],
      }).compile();
      service = moduleRef.get(StatusService);
    });

    it('looks the tenant up by the hash of the token and selects only what the page needs', async () => {
      prisma.tenant.findUnique.mockResolvedValueOnce(row);

      const result = await service.publicStatus(token);

      expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { statusTokenHash: hashStatusToken(token) },
        select: PUBLIC_STATUS_SELECT,
      });
      expect(PUBLIC_STATUS_SELECT).not.toHaveProperty('id');
      expect(result.name).toBe('Globex');
    });

    it('404s for a token nobody has', async () => {
      prisma.tenant.findUnique.mockResolvedValueOnce(null);

      await expect(service.publicStatus(token)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
