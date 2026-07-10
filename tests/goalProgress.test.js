// tests/goalProgress.test.js
// Goal progress is DERIVED from real logs at read time — the stored
// current_value column is write-only and frozen at 0. These pin the period
// math, the per-goal derivation, and the loader's grouped-sum wiring.

const { _periodStart, _currentFor } = require('../server/services/ai/goalProgress');

const NOW = new Date('2026-07-10T15:30:00Z');

describe('goalProgress period boundaries (UTC)', () => {
  test('daily starts at today 00:00Z', () => {
    expect(_periodStart('daily', NOW).toISOString()).toBe('2026-07-10T00:00:00.000Z');
  });

  test('monthly starts on the 1st of the current month', () => {
    expect(_periodStart('monthly', NOW).toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  test('weekly is a rolling 7 days', () => {
    expect(_periodStart('weekly', NOW).toISOString()).toBe('2026-07-03T15:30:00.000Z');
  });
});

describe('goalProgress derivation per goal', () => {
  test('health goal sums its own metric only', () => {
    const sums = { health: { steps: 6800, sleep: 7.5 } };
    expect(_currentFor({ domain: 'health', metric_type: 'steps' }, sums)).toBe(6800);
    expect(_currentFor({ domain: 'health', metric_type: 'sleep' }, sums)).toBe(7.5);
    expect(_currentFor({ domain: 'health', metric_type: 'water' }, sums)).toBe(0);
  });

  test('budget counts spend in the goal currency only — ILS budget never absorbs USD rows', () => {
    const sums = { income: { ILS: 1000 }, expense: { ILS: 350, USD: 999 } };
    expect(_currentFor({ domain: 'finance', metric_type: 'budget', unit: 'ILS' }, sums)).toBe(350);
  });

  test('savings = income − expense for the period (can go negative — honest)', () => {
    const sums = { income: { ILS: 1000 }, expense: { ILS: 350 } };
    expect(_currentFor({ domain: 'finance', metric_type: 'savings', unit: 'ILS' }, sums)).toBe(650);
    expect(_currentFor(
      { domain: 'finance', metric_type: 'savings', unit: 'ILS' },
      { income: { ILS: 100 }, expense: { ILS: 350 } },
    )).toBe(-250);
  });

  test('no goal currency → sums across currencies; no sums at all → 0', () => {
    const sums = { income: {}, expense: { ILS: 100, USD: 50 } };
    expect(_currentFor({ domain: 'finance', metric_type: 'budget' }, sums)).toBe(150);
    expect(_currentFor({ domain: 'finance', metric_type: 'budget', unit: 'ILS' }, {})).toBe(0);
  });
});

describe('getGoalsWithProgress (loader wiring)', () => {
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
          // Sum window must be the goal period, not the context window.
          expect(where.logged_at[Op.gte]).toBeInstanceOf(Date);
          return [{ type: 'steps', total: '6800' }];
        }),
      },
      FinancialLog: {
        findAll: jest.fn(async () => ([
          { type: 'expense', currency: 'ILS', total: '350' },
          { type: 'income', currency: 'ILS', total: '1000' },
        ])),
      },
    }));
    const { getGoalsWithProgress } = require('../server/services/ai/goalProgress');
    const goals = await getGoalsWithProgress(7, { now: NOW });
    expect(goals).toEqual([
      { domain: 'health', metric: 'steps', target: 10000, current: 6800, unit: 'steps', period: 'daily', end_date: null },
      { domain: 'finance', metric: 'budget', target: 1200, current: 350, unit: 'ILS', period: 'monthly', end_date: null },
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
});
