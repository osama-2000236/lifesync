// tests/contextWindow.test.js
// Wide, switchable context window + max user harness (XD links, denser logs).
const {
  _resolveWindow,
  _mapLinkedDomains,
} = require('../server/services/ai/bertContextService');
const { _buildContextSummary } = require('../server/services/ai/bertNlpService');

const ENV_KEYS = ['CONTEXT_WINDOW_DAYS', 'CONTEXT_MESSAGES', 'CONTEXT_MAX_ENTRIES', 'CONTEXT_RECENT_ENTRIES'];

describe('context window resolver', () => {
  let saved;
  beforeEach(() => { saved = {}; ENV_KEYS.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; }); });
  afterEach(() => { ENV_KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }); });

  test('standard window uses wide human-tracker defaults', () => {
    const w = _resolveWindow(null);
    expect(w).toMatchObject({ mode: 'standard', days: 90, messages: 40, entries: 200, recent: 24, links: 4 });
  });

  test('deep switch scales history + data + links', () => {
    const w = _resolveWindow('deep');
    expect(w.mode).toBe('deep');
    expect(w.days).toBe(270);
    expect(w.messages).toBe(80);
    expect(w.entries).toBe(600);
    expect(w.links).toBe(8);
    expect(w.memory).toBe(16);
  });

  test('max harness is widest: 365d, 120 msgs, 800 logs, 16 XD links', () => {
    const w = _resolveWindow('max');
    expect(w.mode).toBe('max');
    expect(w.days).toBe(365);
    expect(w.messages).toBe(120);
    expect(w.entries).toBe(800);
    expect(w.recent).toBe(72); // 24 * 3
    expect(w.links).toBe(16);
    expect(w.memory).toBe(20);
  });

  test('env overrides the standard window and is clamped to bounds', () => {
    process.env.CONTEXT_MESSAGES = '50';
    process.env.CONTEXT_WINDOW_DAYS = '9999';
    const w = _resolveWindow(null);
    expect(w.messages).toBe(50);
    expect(w.days).toBe(365);
  });

  test('garbage env falls back to defaults', () => {
    process.env.CONTEXT_MESSAGES = 'abc';
    expect(_resolveWindow(null).messages).toBe(40);
  });
});

describe('linked domain mapping + summary harness', () => {
  test('mapLinkedDomains keeps health↔finance pairs', () => {
    const mapped = _mapLinkedDomains([{
      source_message: 'spent 50 on dinner',
      link_type: 'auto_nlp',
      healthLog: { type: 'nutrition', value: 1, value_text: 'dinner', unit: 'meal' },
      financialLog: { type: 'expense', amount: 50, currency: 'USD', description: 'dinner' },
    }]);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].health.type).toBe('nutrition');
    expect(mapped[0].finance.amount).toBe(50);
  });

  test('context summary cites LINKED pairs when present', () => {
    const s = _buildContextSummary({
      window_days: 90,
      context_window: { mode: 'max' },
      health: { sleep: { average: 6, count: 2 } },
      finance: { USD: { expense: 50, income: 0, transactions: 1, net: -50 } },
      recent_health_entries: [{ type: 'sleep', value: 5 }],
      recent_finance_entries: [{ type: 'expense', amount: 50, currency: 'USD', description: 'dinner' }],
      linked_domains: [{
        health: { type: 'nutrition', value: 1, value_text: 'meal' },
        finance: { type: 'expense', amount: 50, currency: 'USD', description: 'dinner' },
      }],
    }, 'en');
    expect(s).toMatch(/LINKED health↔money/);
    expect(s).toMatch(/nutrition/);
    expect(s).toMatch(/50/);
  });

  test('finance summary is as dense as health (counts, avg, top spends)', () => {
    const { _summarizeFinance } = require('../server/services/ai/bertContextService');
    const fin = _summarizeFinance([
      { type: 'expense', amount: 20, currency: 'USD', description: 'coffee' },
      { type: 'expense', amount: 40, currency: 'USD', description: 'lunch' },
      { type: 'income', amount: 500, currency: 'USD', description: 'salary' },
    ]);
    expect(fin.USD.expense).toBe(60);
    expect(fin.USD.income).toBe(500);
    expect(fin.USD.expense_count).toBe(2);
    expect(fin.USD.income_count).toBe(1);
    expect(fin.USD.avg_expense).toBe(30);
    expect(fin.USD.top_categories.map((c) => c.name)).toEqual(expect.arrayContaining(['coffee', 'lunch']));
    const s = _buildContextSummary({
      window_days: 90,
      finance: fin,
      recent_finance_entries: [
        { type: 'expense', amount: 40, currency: 'USD', description: 'lunch' },
        { type: 'income', amount: 500, currency: 'USD', description: 'salary' },
      ],
    }, 'en');
    expect(s).toMatch(/spent 60|2 expenses/);
    expect(s).toMatch(/avg expense 30/);
    expect(s).toMatch(/top spends/);
    expect(s).toMatch(/latest money/);
  });
});
