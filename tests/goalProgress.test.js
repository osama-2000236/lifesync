// tests/goalProgress.test.js
// Goal progress is DERIVED from real logs at read time — the stored
// current_value column is write-only and frozen at 0. These pin the period
// math, the per-goal derivation (incl. multi-currency FX), and the loader.

const { _periodStart, _currentFor } = require('../server/services/ai/goalProgress');

const NOW = new Date('2026-07-10T15:30:00Z');

/** Fixed rates for offline unit tests: 1 USD = 4 ILS = 1 EUR */
const RATES = {
  base: 'USD',
  date: '2026-07-10',
  source: 'test',
  rates: { USD: 1, ILS: 4, EUR: 1, GBP: 0.8 },
};

describe('goalProgress period boundaries (UTC)', () => {
  test('daily starts at today 00:00Z', () => {
    expect(_periodStart('daily', NOW).toISOString()).toBe('2026-07-10T00:00:00.000Z');
  });

  test('monthly starts on the 1st of the current month', () => {
    expect(_periodStart('monthly', NOW).toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  test('weekly starts on ISO Monday 00:00Z', () => {
    // 2026-07-10 is Friday → ISO week Mon is 2026-07-06
    expect(_periodStart('weekly', NOW).toISOString()).toBe('2026-07-06T00:00:00.000Z');
  });
});

describe('goalProgress derivation per goal', () => {
  test('health goal sums its own metric only', () => {
    const sums = { health: { steps: 6800, sleep: 7.5 } };
    expect(_currentFor({ domain: 'health', metric_type: 'steps' }, sums).current).toBe(6800);
    expect(_currentFor({ domain: 'health', metric_type: 'sleep' }, sums).current).toBe(7.5);
    expect(_currentFor({ domain: 'health', metric_type: 'water' }, sums).current).toBe(0);
  });

  test('budget with FX: ILS goal converts USD spend into ILS and sums', () => {
    // 350 ILS + 25 USD * 4 = 350 + 100 = 450 ILS total spend
    const sums = { income: { ILS: 1000 }, expense: { ILS: 350, USD: 25 } };
    const r = _currentFor(
      { domain: 'finance', metric_type: 'budget', unit: 'ILS' },
      sums,
      RATES,
    );
    expect(r.current).toBe(450);
    expect(r.unit).toBe('ILS');
    expect(r.fx_converted).toBe(true);
    expect(r.fx_missing).toEqual([]);
  });

  test('budget without FX still isolates currency (no invented rates)', () => {
    const sums = { income: { ILS: 1000 }, expense: { ILS: 350, USD: 999 } };
    const r = _currentFor(
      { domain: 'finance', metric_type: 'budget', unit: 'ILS' },
      sums,
      null,
    );
    expect(r.current).toBe(350);
    expect(r.fx_missing).toContain('USD');
  });

  test('savings = converted income − converted expense', () => {
    // income: 1000 ILS + 50 USD(=200 ILS) = 1200 ILS
    // expense: 350 ILS + 10 EUR(=40 ILS) = 390 ILS → savings 810
    const sums = {
      income: { ILS: 1000, USD: 50 },
      expense: { ILS: 350, EUR: 10 },
    };
    const r = _currentFor(
      { domain: 'finance', metric_type: 'savings', unit: 'ILS' },
      sums,
      RATES,
    );
    expect(r.current).toBe(810);
    expect(r.fx_converted).toBe(true);
  });

  test('no goal currency → dominant currency, FX converts others into it', () => {
    // Dominant by absolute volume is ILS (100+50 vs USD 20)
    const sums = { income: {}, expense: { ILS: 100, USD: 20 } };
    const r = _currentFor(
      { domain: 'finance', metric_type: 'budget' },
      sums,
      RATES,
    );
    // 100 ILS + 20*4 USD = 180 ILS
    expect(r.unit).toBe('ILS');
    expect(r.current).toBe(180);
  });

  test('unknown currency left out of total, listed in fx_missing', () => {
    const sums = { expense: { ILS: 100, XYZ: 999 } };
    const r = _currentFor(
      { domain: 'finance', metric_type: 'budget', unit: 'ILS' },
      sums,
      RATES,
    );
    expect(r.current).toBe(100);
    expect(r.fx_missing).toEqual(['XYZ']);
  });
});

describe('getGoalsWithProgress (loader wiring + FX)', () => {
  test('maps active goals to live current from grouped period sums', async () => {
    jest.resetModules();
    const { Op } = require('sequelize');
    jest.doMock('../server/models', () => ({
      UserGoal: {
        findAll: jest.fn(async () => ([
          { domain: 'health', metric_type: 'steps', target_value: '10000', unit: 'steps', period: 'daily', end_date: null },
          { domain: 'finance', metric_type: 'budget', target_value: '1200', unit: 'ILS', period: 'monthly', end_date: null },
        ])),
      },
      HealthLog: {
        findAll: jest.fn(async ({ where }) => {
          expect(where.logged_at[Op.gte]).toBeInstanceOf(Date);
          return [{ type: 'steps', total: '6800' }];
        }),
      },
      FinancialLog: {
        findAll: jest.fn(async () => ([
          { type: 'expense', currency: 'ILS', total: '350' },
          { type: 'expense', currency: 'USD', total: '25' },
          { type: 'income', currency: 'ILS', total: '1000' },
        ])),
      },
    }));
    const { getGoalsWithProgress } = require('../server/services/ai/goalProgress');
    const goals = await getGoalsWithProgress(7, { now: NOW, ratesTable: RATES });
    expect(goals).toEqual([
      {
        domain: 'health', metric: 'steps', target: 10000, current: 6800,
        unit: 'steps', period: 'daily', end_date: null,
      },
      {
        domain: 'finance', metric: 'budget', target: 1200, current: 450,
        unit: 'ILS', period: 'monthly', end_date: null,
        fx: {
          base: 'USD',
          as_of: '2026-07-10',
          source: 'test',
          converted: true,
          missing: [],
        },
      },
    ]);
    jest.dontMock('../server/models');
  });

  test('no active goals → no log queries at all', async () => {
    jest.resetModules();
    jest.doMock('../server/models', () => ({
      UserGoal: { findAll: jest.fn(async () => []) },
      HealthLog: { findAll: jest.fn() },
      FinancialLog: { findAll: jest.fn() },
    }));
    const { getGoalsWithProgress } = require('../server/services/ai/goalProgress');
    expect(await getGoalsWithProgress(7)).toEqual([]);
    const models = require('../server/models');
    expect(models.HealthLog.findAll).not.toHaveBeenCalled();
    expect(models.FinancialLog.findAll).not.toHaveBeenCalled();
    jest.dontMock('../server/models');
  });

  test('live Frankfurter rates convert USD→ILS for real (network)', async () => {
    // Integration check against public API — skip if offline.
    let live;
    try {
      const { clearFxCache, getRatesTable, convertAmount } = require('../server/services/fxService');
      clearFxCache();
      live = await getRatesTable({ base: 'USD', force: true });
      if (live.source !== 'frankfurter' || !live.rates.ILS) {
        // eslint-disable-next-line no-console
        console.warn('skip live FX: rates unavailable', live.error || live.source);
        return;
      }
      const ils = convertAmount(1, 'USD', 'ILS', live);
      expect(ils).toBeGreaterThan(1);
      expect(ils).toBeLessThan(20);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('skip live FX:', err.message);
    }
  });
});
