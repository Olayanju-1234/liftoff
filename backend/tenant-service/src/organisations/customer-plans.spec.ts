import { DEFAULT_CUSTOMER_PLANS } from '@liftoff/shared-types';
import {
  effectivePlans,
  planNameFor,
  pricesFor,
  resolvePlanId,
  storedPrices,
  toStoredPlans,
} from './customer-plans';

describe('customer plans', () => {
  const custom = [
    { id: 'growth', name: 'Growth', description: 'For teams of 10 to 50' },
    { id: 'scale', name: 'Scale' },
  ];

  describe('effectivePlans', () => {
    it('falls back to the three defaults when none are stored', () => {
      expect(effectivePlans(null)).toEqual(DEFAULT_CUSTOMER_PLANS);
      expect(effectivePlans(undefined)).toEqual(DEFAULT_CUSTOMER_PLANS);
      expect(effectivePlans({ not: 'a list' })).toEqual(DEFAULT_CUSTOMER_PLANS);
      expect(effectivePlans([])).toEqual(DEFAULT_CUSTOMER_PLANS);
    });

    it('returns stored plans, dropping entries it cannot use', () => {
      expect(
        effectivePlans([
          ...custom,
          { id: 'Bad Id', name: 'x' },
          { id: 'noname' },
          'junk',
          null,
          { id: 'blank', name: 'Blank', description: '' },
        ]),
      ).toEqual([...custom, { id: 'blank', name: 'Blank' }]);
    });

    it('round-trips through toStoredPlans', () => {
      expect(effectivePlans(toStoredPlans(custom))).toEqual(custom);
    });
  });

  describe('resolvePlanId', () => {
    it('matches by id, by name, case-insensitively and trimmed', () => {
      expect(resolvePlanId(custom, 'growth')).toBe('growth');
      expect(resolvePlanId(custom, ' Growth ')).toBe('growth');
      expect(resolvePlanId(custom, 'SCALE')).toBe('scale');
      expect(resolvePlanId(effectivePlans(null), 'Starter')).toBe('starter');
    });

    it('is undefined for a plan the company does not have', () => {
      expect(resolvePlanId(custom, 'starter')).toBeUndefined();
      expect(resolvePlanId(effectivePlans(null), 'growth')).toBeUndefined();
    });
  });

  it('names a plan by id and falls back to the id for a removed plan', () => {
    expect(planNameFor(custom, 'growth')).toBe('Growth');
    expect(planNameFor(custom, 'legacy')).toBe('legacy');
  });

  describe('prices', () => {
    it('keeps only usable stored entries and shows a slot per plan', () => {
      const stored = storedPrices({
        growth: 'price_growth',
        legacy: 'price_legacy',
        scale: '',
        'Bad Id': 'price_x',
        pro: null,
      });
      expect(stored).toEqual({
        growth: 'price_growth',
        legacy: 'price_legacy',
      });
      expect(pricesFor(custom, stored)).toEqual({
        growth: 'price_growth',
        scale: null,
      });
      expect(storedPrices(null)).toEqual({});
      expect(storedPrices(['price_x'])).toEqual({});
    });
  });
});
