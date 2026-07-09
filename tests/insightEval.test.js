// tests/insightEval.test.js
// ============================================
// Insight Engine + Localizer LOCK HARNESS (CI floors).
// ============================================
// 1) Every SAMPLES string from insightTemplates fully localizes to Arabic.
// 2) Engine detectors emit only catalog builders (spot-check via T).
// 3) Qualitative meal nutrition is excluded from mood–nutrition correlation.
// 4) localizeInsights remains additive.
//
// Run: npm run test:eval:insight

const {
  T, SAMPLES, RULES, CATEGORY_AR,
} = require('../server/services/ai/insightTemplates');
const { localizeInsightText, localizeInsights } = require('../server/services/ai/insightLocalizer');
const {
  detectMoodNutritionImpact,
  detectSleepSpendingCorrelation,
  detectBudgetPatterns,
  detectActivityMoodLink,
} = require('../server/services/ai/insightEngine');

const ARABIC = /[\u0600-\u06FF]/;
// Residual English content words that should not remain after localization
// (allow r=, numbers, currency, units, short joiners already replaced).
const RESIDUAL_EN = /\b(when|sleep|spending|mood|active|water|health|money|week|saving|impulse|correlation|days|better|worse|keep|logging|tips|average|about|right|now|try|aim|hours|minutes|movement|feel|linked|strong|clear|jump|trimmed|non-essentials|emotional|eating|busier|pushing)\b/i;

describe('insight template catalog floors', () => {
  test('SAMPLES is non-trivial and RULES non-empty', () => {
    expect(SAMPLES.length).toBeGreaterThanOrEqual(20);
    expect(RULES.length).toBeGreaterThanOrEqual(20);
    expect(Object.keys(CATEGORY_AR).length).toBeGreaterThanOrEqual(10);
    expect(CATEGORY_AR.Uncategorized).toBeTruthy();
  });

  test.each(SAMPLES.map((s, i) => [i, s]))('sample %s fully localizes to Arabic', (_i, en) => {
    const ar = localizeInsightText(en);
    expect(ar).toMatch(ARABIC);
    expect(ar).not.toBe(en);
    // No leftover English content words (numbers / r= / $ ok)
    expect(ar).not.toMatch(RESIDUAL_EN);
  });

  test('unknown English falls through unchanged (no silent invent)', () => {
    const s = 'Brand new detector text not in the catalog yet.';
    expect(localizeInsightText(s)).toBe(s);
  });
});

describe('engine detectors use catalog templates', () => {
  const day = (offset) => new Date(Date.now() - offset * 86400000).toISOString();

  test('sleep–spend concerning observation matches T.sleepSpendNegative shape', () => {
    const health = [0, 1, 2, 3, 4].map((d) => ({
      type: 'sleep', value: d % 2 ? 8 : 4, logged_at: day(d),
    }));
    const finance = [0, 1, 2, 3, 4].map((d) => ({
      type: 'expense', amount: d % 2 ? 10 : 80, logged_at: day(d),
    }));
    const p = detectSleepSpendingCorrelation(health, finance);
    expect(p).toBeTruthy();
    expect(p.observation).toMatch(/^When you sleep less|^Better sleep|^No clear sleep/);
    // Fully localizable
    const ar = localizeInsightText(p.observation);
    expect(ar).toMatch(ARABIC);
    expect(ar).not.toMatch(RESIDUAL_EN);
  });

  test('budget low-savings uses T.savingsLow', () => {
    const financeAgg = [
      { type: 'income', total: '1000', category: { name: 'Salary' } },
      { type: 'expense', total: '950', count: 5, category: { name: 'Food & Dining' } },
    ];
    const p = detectBudgetPatterns(financeAgg, []);
    const hit = p.suggestions.find((s) => s.text.includes('saving about'));
    expect(hit).toBeTruthy();
    expect(localizeInsightText(hit.text)).toMatch(ARABIC);
  });

  test('qualitative meal nutrition is ignored in mood–nutrition correlation', () => {
    // 5 days: mood + only unit=meal nutrition (should not drive kcal correlation)
    const health = [];
    for (let d = 0; d < 5; d += 1) {
      health.push({ type: 'mood', value: 5 + d * 0.5, logged_at: day(d) });
      health.push({
        type: 'nutrition', value: 1, unit: 'meal', value_text: 'dinner', logged_at: day(d),
      });
      health.push({ type: 'water', value: 1 + d * 0.2, logged_at: day(d) });
    }
    const p = detectMoodNutritionImpact(health);
    // Should still run (mood+water) but meal flags must not appear as kcal totals
    expect(p).toBeTruthy();
    // If only meal nutrition, mood-nutrition corr is on zeros → usually none message
    // Water may produce a water-mood line when r is high
    expect(p.observation).toMatch(/mood|water|food/i);
    expect(p.observation).not.toMatch(/1 kcal/);
  });

  test('activity–mood observation is catalog-shaped', () => {
    const health = [];
    for (let d = 0; d < 5; d += 1) {
      health.push({ type: 'mood', value: 4 + d, logged_at: day(d) });
      health.push({ type: 'exercise', value: 10 + d * 10, duration: 10 + d * 10, logged_at: day(d) });
    }
    const p = detectActivityMoodLink(health);
    expect(p).toBeTruthy();
    expect(p.observation).toMatch(/^Active days|^Odd one|^No clear activity/);
    expect(localizeInsightText(p.observation)).toMatch(ARABIC);
  });
});

describe('localizeInsights payload contract', () => {
  test('attaches _ar mirrors without mutating English', () => {
    const input = {
      summary: T.moodTrendingUp(),
      cross_domain_insights: T.crossDomainNone(),
      recommendations: [
        { text: T.recWaterMood(), reason: T.weekInOut(10, 5), priority: 'low' },
      ],
      health_score: 70,
    };
    const out = localizeInsights(input);
    expect(out.summary).toBe(input.summary);
    expect(out.summary_ar).toMatch(ARABIC);
    expect(out.cross_domain_insights_ar).toMatch(ARABIC);
    expect(out.recommendations[0].text_ar).toMatch(ARABIC);
    expect(out.recommendations[0].reason_ar).toMatch(/10\$/);
    expect(out.health_score).toBe(70);
  });

  test('T builders match samples used by RULES', () => {
    // Spot-check: changing a builder without RULES must fail residual check
    expect(SAMPLES).toContain(T.crossDomainNone());
    expect(SAMPLES).toContain(T.recSleepSpend());
  });
});
