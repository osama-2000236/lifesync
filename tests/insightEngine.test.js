// tests/insightEngine.test.js
// ============================================
// Insight Engine Unit Tests
// Tests: Pearson correlation, pattern detectors,
//        score calculators
// ============================================

const {
  pearsonCorrelation,
  detectSleepSpendingCorrelation,
  detectMoodNutritionImpact,
  detectBudgetPatterns,
  detectActivityMoodLink,
  calculateHealthScore,
  calculateFinancialScore,
} = require('../server/services/ai/insightEngine');

// ────────────────────────────────────────────
// STATISTICAL HELPERS
// ────────────────────────────────────────────

describe('pearsonCorrelation', () => {
  test('returns 1.0 for perfectly correlated data', () => {
    const result = pearsonCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
    expect(result.r).toBe(1);
    expect(result.significance).toBe('strong');
  });

  test('returns -1.0 for perfectly inverse correlated data', () => {
    const result = pearsonCorrelation([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]);
    expect(result.r).toBe(-1);
  });

  test('returns ~0 for uncorrelated data', () => {
    const result = pearsonCorrelation([1, 2, 3, 4, 5], [3, 1, 4, 1, 5]);
    expect(Math.abs(result.r)).toBeLessThan(0.5);
  });

  test('handles insufficient data (< 3 points)', () => {
    const result = pearsonCorrelation([1, 2], [3, 4]);
    expect(result.significance).toBe('insufficient_data');
  });

  test('handles constant values (zero variance)', () => {
    const result = pearsonCorrelation([5, 5, 5], [1, 2, 3]);
    expect(result.significance).toBe('no_variance');
  });

  test('classifies significance correctly', () => {
    // Strong: |r| > 0.7 with n >= 5
    const strong = pearsonCorrelation([1, 2, 3, 4, 5], [1.1, 2.2, 2.9, 4.1, 5.0]);
    expect(strong.significance).toBe('strong');

    // Weak: small correlation
    const weak = pearsonCorrelation([1, 2, 3, 4, 5], [3, 2, 4, 3, 5]);
    expect(['weak', 'moderate', 'negligible']).toContain(weak.significance);
  });
});

// ────────────────────────────────────────────
// SLEEP ↔ SPENDING DETECTOR
// ────────────────────────────────────────────

describe('detectSleepSpendingCorrelation', () => {
  const makeHealthRow = (type, value, dayOffset = 0) => ({
    type,
    value,
    logged_at: new Date(Date.now() - dayOffset * 86400000).toISOString(),
  });

  const makeFinanceRow = (type, amount, dayOffset = 0) => ({
    type,
    amount,
    logged_at: new Date(Date.now() - dayOffset * 86400000).toISOString(),
  });

  test('detects negative correlation (low sleep → high spending)', () => {
    const health = [
      makeHealthRow('sleep', 5, 0), // Low sleep
      makeHealthRow('sleep', 8, 1), // Good sleep
      makeHealthRow('sleep', 4, 2), // Low sleep
      makeHealthRow('sleep', 7, 3), // Good sleep
      makeHealthRow('sleep', 5, 4), // Low sleep
    ];
    const finance = [
      makeFinanceRow('expense', 80, 0),  // High spend
      makeFinanceRow('expense', 20, 1),  // Low spend
      makeFinanceRow('expense', 100, 2), // High spend
      makeFinanceRow('expense', 15, 3),  // Low spend
      makeFinanceRow('expense', 90, 4),  // High spend
    ];

    const result = detectSleepSpendingCorrelation(health, finance);
    expect(result).not.toBeNull();
    expect(result.pattern).toBe('sleep_spending_correlation');
    expect(result.correlation.r).toBeLessThan(0);
  });

  test('returns null with insufficient data', () => {
    const result = detectSleepSpendingCorrelation(
      [makeHealthRow('sleep', 7, 0)],
      [makeFinanceRow('expense', 50, 0)]
    );
    expect(result).toBeNull();
  });

  test('handles no sleep entries', () => {
    const health = [makeHealthRow('steps', 8000, 0), makeHealthRow('mood', 7, 1)];
    const finance = [makeFinanceRow('expense', 50, 0)];
    const result = detectSleepSpendingCorrelation(health, finance);
    expect(result).toBeNull();
  });
});

// ────────────────────────────────────────────
// MOOD ↔ NUTRITION DETECTOR
// ────────────────────────────────────────────

describe('detectMoodNutritionImpact', () => {
  const makeEntry = (type, value, dayOffset = 0) => ({
    type,
    value,
    logged_at: new Date(Date.now() - dayOffset * 86400000).toISOString(),
  });

  test('detects mood-water correlation', () => {
    const health = [
      makeEntry('mood', 8, 0), makeEntry('water', 3, 0),
      makeEntry('mood', 5, 1), makeEntry('water', 1, 1),
      makeEntry('mood', 9, 2), makeEntry('water', 2.5, 2),
      makeEntry('mood', 4, 3), makeEntry('water', 0.5, 3),
      makeEntry('mood', 7, 4), makeEntry('water', 2, 4),
    ];

    const result = detectMoodNutritionImpact(health);
    expect(result).not.toBeNull();
    expect(result.pattern).toBe('mood_nutrition_impact');
    expect(result.avg_mood).toBeGreaterThan(0);
  });

  test('returns null with insufficient mood data', () => {
    const health = [makeEntry('steps', 8000, 0), makeEntry('water', 2, 0)];
    const result = detectMoodNutritionImpact(health);
    expect(result).toBeNull();
  });
});

// ────────────────────────────────────────────
// SMART BUDGET DETECTOR
// ────────────────────────────────────────────

describe('detectBudgetPatterns', () => {
  test('generates budget analysis with income and expenses', () => {
    const financeAgg = [
      { type: 'income', total: '2000', count: 2, category: { name: 'Salary' } },
      { type: 'expense', total: '500', count: 5, category: { name: 'Food & Dining' } },
      { type: 'expense', total: '200', count: 3, category: { name: 'Transportation' } },
    ];
    const prevAgg = [
      { type: 'income', total: '1800' },
      { type: 'expense', total: '600' },
    ];

    const result = detectBudgetPatterns(financeAgg, prevAgg);
    expect(result.pattern).toBe('smart_budget');
    expect(result.income_this_week).toBe(2000);
    expect(result.expenses_this_week).toBe(700);
    expect(result.savings_rate).toBeGreaterThan(0);
    expect(result.top_categories).toHaveLength(2);
    expect(result.monthly_projected).toBeDefined();
  });

  test('flags high concentration in single category', () => {
    const financeAgg = [
      { type: 'income', total: '1000', category: { name: 'Salary' } },
      { type: 'expense', total: '800', count: 10, category: { name: 'Shopping' } },
      { type: 'expense', total: '50', count: 2, category: { name: 'Food' } },
    ];

    const result = detectBudgetPatterns(financeAgg, []);
    const highConcSuggestion = result.suggestions.find((s) => s.text.includes('accounts for'));
    expect(highConcSuggestion).toBeDefined();
  });

  test('flags low savings rate', () => {
    const financeAgg = [
      { type: 'income', total: '100', category: { name: 'Salary' } },
      { type: 'expense', total: '95', count: 5, category: { name: 'Food' } },
    ];

    const result = detectBudgetPatterns(financeAgg, []);
    expect(result.savings_rate).toBeLessThan(10);
    const lowSavingsSuggestion = result.suggestions.find((s) => s.text.includes('savings rate'));
    expect(lowSavingsSuggestion).toBeDefined();
  });
});

// ────────────────────────────────────────────
// ACTIVITY ↔ MOOD DETECTOR
// ────────────────────────────────────────────

describe('detectActivityMoodLink', () => {
  const makeEntry = (type, value, dayOffset = 0, duration) => ({
    type,
    value,
    duration,
    logged_at: new Date(Date.now() - dayOffset * 86400000).toISOString(),
  });

  test('detects positive activity-mood correlation', () => {
    const health = [
      makeEntry('mood', 8, 0), makeEntry('exercise', 30, 0, 30),
      makeEntry('mood', 5, 1), makeEntry('exercise', 10, 1, 10),
      makeEntry('mood', 9, 2), makeEntry('exercise', 45, 2, 45),
      makeEntry('mood', 4, 3), makeEntry('exercise', 5, 3, 5),
    ];

    const result = detectActivityMoodLink(health);
    expect(result).not.toBeNull();
    expect(result.pattern).toBe('activity_mood_link');
    expect(result.correlation.r).toBeGreaterThan(0);
  });

  test('includes steps as activity', () => {
    const health = [
      makeEntry('mood', 8, 0), makeEntry('steps', 10000, 0),
      makeEntry('mood', 5, 1), makeEntry('steps', 2000, 1),
      makeEntry('mood', 7, 2), makeEntry('steps', 8000, 2),
    ];

    const result = detectActivityMoodLink(health);
    expect(result).not.toBeNull();
  });
});

// ────────────────────────────────────────────
// SCORE CALCULATIONS
// ────────────────────────────────────────────

describe('calculateHealthScore', () => {
  test('gives high score for good sleep, mood, steps, water', () => {
    const agg = [
      { type: 'sleep', avg_value: '7.5', total_value: '52.5' },
      { type: 'mood', avg_value: '8' },
      { type: 'steps', total_value: '70000' },
      { type: 'water', avg_value: '2.5' },
    ];
    const score = calculateHealthScore(agg);
    expect(score).toBeGreaterThanOrEqual(80);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('gives lower score for poor sleep', () => {
    const agg = [
      { type: 'sleep', avg_value: '4' },
      { type: 'mood', avg_value: '4' },
    ];
    const score = calculateHealthScore(agg);
    expect(score).toBeLessThan(70);
  });

  test('returns base score with no data', () => {
    expect(calculateHealthScore([])).toBe(50);
  });
});

describe('calculateFinancialScore', () => {
  test('gives high score for good savings rate', () => {
    const agg = [
      { type: 'income', total: '2000' },
      { type: 'expense', total: '800', category: { name: 'Food' } },
      { type: 'expense', total: '200', category: { name: 'Transport' } },
    ];
    const score = calculateFinancialScore(agg);
    expect(score).toBeGreaterThanOrEqual(70);
  });

  test('gives lower score when expenses exceed income', () => {
    const agg = [
      { type: 'income', total: '500' },
      { type: 'expense', total: '600', category: { name: 'Shopping' } },
    ];
    const score = calculateFinancialScore(agg);
    expect(score).toBeLessThan(60);
  });

  test('returns base score with no data', () => {
    expect(calculateFinancialScore([])).toBe(50);
  });
});
