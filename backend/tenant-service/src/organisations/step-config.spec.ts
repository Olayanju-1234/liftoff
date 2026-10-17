import { CUSTOM_STEP_DEFAULT_TIMEOUT_MS } from '@liftoff/shared-types';
import {
  customStepNames,
  effectiveStepConfig,
  mergeStepConfig,
  stepConfigFor,
  storedStepConfig,
} from './step-config';

const builtin = {
  mode: 'builtin',
  url: null,
  timeoutMs: CUSTOM_STEP_DEFAULT_TIMEOUT_MS,
};

describe('step config', () => {
  describe('effectiveStepConfig', () => {
    it.each([null, undefined, 'x', [], 42])(
      'reads %p as every step builtin',
      (raw) => {
        expect(effectiveStepConfig(raw)).toEqual({
          database: builtin,
          address: builtin,
          credentials: builtin,
          billing: builtin,
          welcome: builtin,
        });
      },
    );

    it('fills in the default timeout and leaves the other steps builtin', () => {
      const config = effectiveStepConfig({
        database: { mode: 'custom', url: 'https://acme.test/db' },
        billing: { mode: 'skipped' },
      });

      expect(config.database).toEqual({
        mode: 'custom',
        url: 'https://acme.test/db',
        timeoutMs: CUSTOM_STEP_DEFAULT_TIMEOUT_MS,
      });
      expect(config.billing).toEqual({ ...builtin, mode: 'skipped' });
      expect(config.address).toEqual(builtin);
    });

    it('drops anything an earlier write could not have stored', () => {
      expect(
        storedStepConfig({
          database: { mode: 'magic', url: 'https://acme.test' },
          address: 'custom',
          dns: { mode: 'custom', url: 'https://acme.test' },
          welcome: { mode: 'custom', url: 'https://acme.test', timeoutMs: 5 },
        }),
      ).toEqual({ welcome: { mode: 'custom', url: 'https://acme.test' } });
    });

    it('answers one step at a time for dispatch', () => {
      const raw = { address: { mode: 'custom', url: 'https://acme.test/dns' } };

      expect(stepConfigFor(raw, 'address').mode).toBe('custom');
      expect(stepConfigFor(raw, 'database')).toEqual(builtin);
    });
  });

  describe('mergeStepConfig', () => {
    const current = {
      database: {
        mode: 'custom' as const,
        url: 'https://acme.test/db',
        timeoutMs: 120_000,
      },
      billing: { mode: 'skipped' as const },
    };

    it('changes only the steps sent and keeps a url the update leaves out', () => {
      const merged = mergeStepConfig(current, {
        database: { mode: 'skipped' },
        welcome: { mode: 'custom', url: 'https://acme.test/welcome' },
      });

      expect(merged).toEqual({
        database: {
          mode: 'skipped',
          url: 'https://acme.test/db',
          timeoutMs: 120_000,
        },
        billing: { mode: 'skipped' },
        welcome: { mode: 'custom', url: 'https://acme.test/welcome' },
      });
      expect(customStepNames(merged)).toEqual(['welcome']);
    });

    it('puts a step sent as null back to builtin with nothing kept', () => {
      expect(mergeStepConfig(current, { database: null })).toEqual({
        billing: { mode: 'skipped' },
      });
    });

    it('leaves the stored config alone', () => {
      mergeStepConfig(current, { billing: null });

      expect(current.billing).toEqual({ mode: 'skipped' });
    });
  });
});
