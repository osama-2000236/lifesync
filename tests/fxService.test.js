// tests/fxService.test.js — FX convert + rates table (no live network in unit path)

const {
  isMoneyUnit,
  normalizeCurrency,
  convertAmount,
  sumInCurrency,
  getRatesTable,
  clearFxCache,
} = require('../server/services/fxService');

describe('fxService money units', () => {
  test('accepts ISO currency codes, rejects health units', () => {
    expect(isMoneyUnit('USD')).toBe(true);
    expect(isMoneyUnit('ils')).toBe(true);
    expect(isMoneyUnit('steps')).toBe(false);
    expect(isMoneyUnit('hours')).toBe(false);
    expect(isMoneyUnit('liters')).toBe(false);
    expect(normalizeCurrency('ils')).toBe('ILS');
    expect(normalizeCurrency('steps')).toBeNull();
  });
});

describe('fxService convertAmount', () => {
  const table = {
    base: 'USD',
    date: '2026-07-10',
    source: 'test',
    rates: { USD: 1, ILS: 3, EUR: 0.9, GBP: 0.75 },
  };

  test('identity and cross rates', () => {
    expect(convertAmount(100, 'USD', 'USD', table)).toBe(100);
    expect(convertAmount(100, 'USD', 'ILS', table)).toBe(300);
    expect(convertAmount(300, 'ILS', 'USD', table)).toBe(100);
    // EUR → ILS via USD base: 90 EUR * (3/0.9) = 300 ILS
    expect(convertAmount(90, 'EUR', 'ILS', table)).toBe(300);
  });

  test('missing currency returns null (never invents a rate)', () => {
    expect(convertAmount(10, 'USD', 'XYZ', table)).toBeNull();
    expect(convertAmount(10, 'XYZ', 'USD', table)).toBeNull();
    expect(convertAmount(Number.NaN, 'USD', 'ILS', table)).toBeNull();
  });
});

describe('fxService sumInCurrency', () => {
  const table = {
    base: 'USD',
    rates: { USD: 1, ILS: 4, EUR: 1 },
  };

  test('sums multi-currency into target', () => {
    const r = sumInCurrency({ ILS: 400, USD: 50, EUR: 10 }, 'ILS', table);
    // 400 ILS + 50*4 USD + 10*4 EUR = 400+200+40 = 640
    expect(r.total).toBe(640);
    expect(r.converted).toBe(true);
    expect(r.missing).toEqual([]);
  });

  test('records missing currencies without inventing rates', () => {
    const r = sumInCurrency({ ILS: 100, JPY: 5000 }, 'ILS', table);
    expect(r.total).toBe(100);
    expect(r.missing).toEqual(['JPY']);
  });
});

describe('fxService getRatesTable', () => {
  beforeEach(() => clearFxCache());

  test('uses injected fetch and caches by base', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return {
        ok: true,
        json: async () => ({
          amount: 1,
          base: 'USD',
          date: '2026-07-10',
          rates: { EUR: 0.9, ILS: 3.0 },
        }),
      };
    };
    const a = await getRatesTable({ base: 'USD', fetchImpl, now: 1_000 });
    const b = await getRatesTable({ base: 'USD', fetchImpl, now: 1_000 + 60_000 });
    expect(calls).toBe(1);
    expect(a.rates.USD).toBe(1);
    expect(a.rates.ILS).toBe(3);
    expect(a.source).toBe('frankfurter');
    expect(b.rates.EUR).toBe(0.9);
  });

  test('fetch failure → fallback identity table (no crash)', async () => {
    const fetchImpl = async () => {
      throw new Error('network_down');
    };
    const table = await getRatesTable({ base: 'USD', fetchImpl, now: 2_000, force: true });
    expect(table.source).toBe('fallback');
    expect(table.rates).toEqual({ USD: 1 });
    expect(table.error).toMatch(/network_down|fx_/);
  });
});
