const {
  _summarizeHealth,
  _summarizeFinance,
} = require('../server/services/ai/bertContextService');

describe('BERT structured context summaries', () => {
  test('summarizes health metrics for deterministic personalization', () => {
    expect(_summarizeHealth([
      { type: 'sleep', value: 6, unit: 'hours' },
      { type: 'sleep', value: 8, unit: 'hours' },
      { type: 'mood', value: 4, unit: 'rating' },
      { type: 'mood', value: 6, unit: 'rating' },
    ])).toEqual({
      sleep: { count: 2, latest: 6, unit: 'hours', average: 7 },
      mood: { count: 2, latest: 4, unit: 'rating', average: 5 },
    });
  });

  test('keeps currency totals separate and computes net', () => {
    expect(_summarizeFinance([
      { type: 'expense', amount: '20.50', currency: 'ILS' },
      { type: 'income', amount: '100', currency: 'ILS' },
      { type: 'expense', amount: '5', currency: 'USD' },
    ])).toEqual({
      ILS: { expense: 20.5, income: 100, transactions: 2, net: 79.5 },
      USD: { expense: 5, income: 0, transactions: 1, net: -5 },
    });
  });
});
