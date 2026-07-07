// Locks insightLocalizer rules to the exact templates in insightEngine.js —
// if a template drifts there without a rule update here, these fail.
const { localizeInsightText, localizeInsights } = require('../server/services/ai/insightLocalizer');

describe('localizeInsightText', () => {
  test('translates every budget template with numbers preserved', () => {
    expect(localizeInsightText('Your savings rate is 5% — aim for at least 20% by reducing discretionary spending.'))
      .toBe('معدل ادخارك 5٪ — استهدف ٢٠٪ على الأقل عبر تقليل الإنفاق غير الضروري.');
    expect(localizeInsightText('Weekly: $200 income vs $190 expenses')).toContain('200$');
    expect(localizeInsightText('Food & Dining accounts for 42.5% of spending. Consider setting a weekly cap.'))
      .toContain('Food & Dining');
    expect(localizeInsightText('$80 this week on Shopping')).toContain('«Shopping»');
    expect(localizeInsightText('Spending increased 35% compared to last week. Review recent transactions for non-essentials.'))
      .toContain('35٪');
    expect(localizeInsightText('This week: $120 vs last week: $80')).toContain('120$');
  });

  test('translates correlation observations including negative r values', () => {
    const neg = localizeInsightText(
      'Negative correlation detected (r=-0.62): you tend to spend more on days you sleep less. Low-sleep days averaged $45 in spending.'
    );
    expect(neg).toContain('r=-0.62');
    expect(neg).toContain('45$');
    expect(localizeInsightText('Positive pattern: better sleep aligns with steady spending habits (r=0.55).')).toContain('r=0.55');
    expect(localizeInsightText('No strong link found between sleep and spending this week (r=0.1).')).toContain('r=0.1');
    expect(localizeInsightText('Active days correlate with better mood (r=0.61). Keep moving!')).toContain('واصل الحركة');
    expect(localizeInsightText('Interestingly, higher activity days show slightly lower mood (r=-0.35). You might be over-exerting.'))
      .toContain('r=-0.35');
    expect(localizeInsightText('No strong activity-mood link this week (r=0.05).')).toContain('r=0.05');
  });

  test('translates concatenated observations piecewise (joins localized too)', () => {
    const joined = 'Better mood correlates with higher nutrition tracking (r=0.5). Additionally, Higher water intake days align with better mood (r=0.44)';
    const out = localizeInsightText(joined);
    expect(out).toContain('إضافة إلى ذلك،');
    expect(out).toContain('r=0.5');
    expect(out).toContain('r=0.44');
    expect(out).not.toMatch(/Better mood|Additionally/);
  });

  test('translates cross-domain recs, summary fallback, and empty-state lines', () => {
    expect(localizeInsightText('Try to get 7+ hours of sleep to reduce impulse spending on low-energy days.')).toContain('٧ ساعات');
    expect(localizeInsightText('Your mood improves on active days. Aim for at least 30 min of movement daily.')).toContain('٣٠ دقيقة');
    expect(localizeInsightText('Staying hydrated correlates with better mood. Try to drink 2L+ daily.')).toContain('لترين');
    expect(localizeInsightText('Water-mood correlation detected')).toContain('شرب الماء');
    expect(localizeInsightText('Your mood has been trending upward — great job!')).toContain('أحسنت');
    expect(localizeInsightText('Health score: 72/100. Financial score: 55/100. Keep tracking for more personalized insights.'))
      .toContain('72/100');
    expect(localizeInsightText('No strong cross-domain patterns detected this week. Keep logging for better insights!'))
      .toContain('لم تُرصد');
    expect(localizeInsightText('Lower mood correlates with more eating (r=-0.5) — possible emotional eating pattern'))
      .toContain('أكل عاطفي');
    expect(localizeInsightText('No strong link between mood and nutrition this week. Avg mood: 6.5/10.')).toContain('6.5/10');
  });

  test('unknown text and empty input fall through unchanged', () => {
    expect(localizeInsightText('Some future template not yet mapped.')).toBe('Some future template not yet mapped.');
    expect(localizeInsightText('')).toBe('');
    expect(localizeInsightText(null)).toBe(null);
  });
});

describe('localizeInsights', () => {
  test('attaches _ar mirrors without touching English fields', () => {
    const input = {
      summary: 'Your mood has been trending upward — great job!',
      cross_domain_insights: 'No strong cross-domain patterns detected this week. Keep logging for better insights!',
      recommendations: [
        { text: 'Water-mood correlation detected', reason: 'Weekly: $10 income vs $5 expenses', priority: 'low' },
      ],
      health_score: 70,
    };
    const out = localizeInsights(input);
    expect(out.summary).toBe(input.summary);
    expect(out.summary_ar).toContain('أحسنت');
    expect(out.cross_domain_insights_ar).toContain('لم تُرصد');
    expect(out.recommendations[0].text_ar).toContain('شرب الماء');
    expect(out.recommendations[0].reason_ar).toContain('10$');
    expect(out.recommendations[0].priority).toBe('low');
    expect(out.health_score).toBe(70);
  });

  test('handles null payloads and missing recommendation arrays', () => {
    expect(localizeInsights(null)).toBe(null);
    const out = localizeInsights({ summary: 'x' });
    expect(out.recommendations).toEqual([]);
  });
});
