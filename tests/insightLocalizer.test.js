// Locks insightLocalizer rules to the exact templates in insightEngine.js —
// if a template drifts there without a rule update here, these fail.
const { localizeInsightText, localizeInsights } = require('../server/services/ai/insightLocalizer');

describe('localizeInsightText', () => {
  test('translates every budget template with numbers preserved', () => {
    expect(localizeInsightText("You're saving about 5% right now — try aiming for 20% by trimming non-essentials."))
      .toContain('5٪');
    expect(localizeInsightText('This week: $200 in, $190 out')).toContain('200$');
    expect(localizeInsightText('Food & Dining is 42.5% of your spending. A weekly cap could help.'))
      .toContain('«طعام ومطاعم»');
    expect(localizeInsightText('$80 on Shopping this week')).toContain('«تسوق»');
    // unseeded/custom category names fall through untranslated
    expect(localizeInsightText('$80 on Crypto this week')).toContain('«Crypto»');
    expect(localizeInsightText('Spending jumped 35% from last week. Worth a quick look for non-essentials.'))
      .toContain('35٪');
    expect(localizeInsightText('This week $120 · last week $80')).toContain('120$');
  });

  test('translates correlation observations including negative r values', () => {
    const neg = localizeInsightText(
      'When you sleep less, spending often goes up (r=-0.62). Low-sleep days averaged about $45.'
    );
    expect(neg).toContain('r=-0.62');
    expect(neg).toContain('45$');
    expect(localizeInsightText('Better sleep lines up with steadier spending for you (r=0.55).')).toContain('r=0.55');
    expect(localizeInsightText('No clear sleep–spending link this week yet (r=0.1).')).toContain('r=0.1');
    expect(localizeInsightText('Active days go with better mood (r=0.61). Keep it up!')).toContain('واصل');
    expect(localizeInsightText('Odd one: busier days show a slightly lower mood (r=-0.35). You might be pushing too hard.'))
      .toContain('r=-0.35');
    expect(localizeInsightText('No clear activity–mood link this week (r=0.05).')).toContain('r=0.05');
  });

  test('translates concatenated observations piecewise (joins localized too)', () => {
    const joined = 'Better mood days go with logging more of what you eat (r=0.5). Also, Higher-water days line up with better mood (r=0.44)';
    const out = localizeInsightText(joined);
    expect(out).toContain('وكذلك');
    expect(out).toContain('r=0.5');
    expect(out).toContain('r=0.44');
    expect(out).not.toMatch(/Better mood|Also,/);
  });

  test('translates cross-domain recs, summary fallback, and empty-state lines', () => {
    expect(localizeInsightText('Aim for 7+ hours of sleep — tired days often come with more impulse spending.')).toContain('٧ ساعات');
    expect(localizeInsightText('You feel better on active days. Try for 30 minutes of movement most days.')).toContain('٣٠ دقيقة');
    expect(localizeInsightText('Days you drink more water often look better for mood. Aim for 2L+.')).toContain('لترين');
    expect(localizeInsightText('Water and mood seem linked in your logs')).toContain('الماء والمزاج');
    expect(localizeInsightText('Your mood is trending up — nice work!')).toContain('أحسنت');
    expect(localizeInsightText('Health 72/100 · Money 55/100. Keep logging for tips that fit you better.'))
      .toContain('72/100');
    expect(localizeInsightText('Nothing strong linking health and money this week. Keep logging — links show up with more history.'))
      .toContain('لا رابط قوي');
    expect(localizeInsightText('Lower mood days go with more eating (r=-0.5) — that can be emotional eating'))
      .toContain('عاطفي');
    expect(localizeInsightText('No clear mood–food link this week. Average mood: 6.5/10.')).toContain('6.5/10');
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
      summary: 'Your mood is trending up — nice work!',
      cross_domain_insights: 'Nothing strong linking health and money this week. Keep logging — links show up with more history.',
      recommendations: [
        { text: 'Water and mood seem linked in your logs', reason: 'This week: $10 in, $5 out', priority: 'low' },
      ],
      health_score: 70,
    };
    const out = localizeInsights(input);
    expect(out.summary).toBe(input.summary);
    expect(out.summary_ar).toContain('أحسنت');
    expect(out.cross_domain_insights_ar).toContain('لا رابط قوي');
    expect(out.recommendations[0].text_ar).toContain('الماء والمزاج');
    expect(out.recommendations[0].reason_ar).toContain('10$');
    expect(out.health_score).toBe(70);
  });

  test('passes through null/non-objects', () => {
    expect(localizeInsights(null)).toBe(null);
    expect(localizeInsights(42)).toBe(42);
  });
});
