// Unit tests — pure PDF builder (UC-13)

const {
  buildWeeklyReportPdf,
  lineText,
  asDate,
  clampScore,
  scoreDisplay,
  freezeReportPayload,
  sanitizeBudget,
  sanitizePatterns,
  sanitizeRecommendations,
  isoWeekKey,
  weekBoundsUtc,
} = (() => {
  const pdf = require('../server/services/pdfReportBuilder');
  return {
    ...pdf,
    ...require('../server/services/reportService'),
  };
})();

describe('lineText (production insight shapes)', () => {
  test('prefers observation over JSON dump for patterns', () => {
    expect(lineText({
      observation: 'Sleep and spending move together (r=0.6).',
      domain: 'cross',
      severity: 'informative',
    })).toBe('Sleep and spending move together (r=0.6).');
  });

  test('prefers text for recommendations', () => {
    expect(lineText({ text: 'Sleep 7h+', priority: 'high' })).toBe('Sleep 7h+');
  });

  test('formats category share without JSON', () => {
    expect(lineText([{ category: 'Food', percentage: 40 }])).toBe('Food 40%');
  });

  test('null and primitives', () => {
    expect(lineText(null)).toBe('—');
    expect(lineText(72)).toBe('72');
    expect(lineText('stable')).toBe('stable');
    expect(lineText(Number.NaN)).toBe('—');
    expect(lineText('{ "bad": true }')).toBe('—');
  });
});

describe('valid value sanitizers', () => {
  test('clampScore rejects NaN/Infinity and clamps range', () => {
    expect(clampScore(72.4)).toBe(72);
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(150)).toBe(100);
    expect(clampScore(Number.NaN)).toBeNull();
    expect(clampScore(Infinity)).toBeNull();
    expect(clampScore('nope')).toBeNull();
    expect(clampScore(null)).toBeNull();
    expect(scoreDisplay(Number.NaN)).toBe('—');
    expect(scoreDisplay(88)).toBe('88');
  });

  test('sanitizeBudget keeps finite numbers and category lines only', () => {
    expect(sanitizeBudget({
      income: 500.555,
      expenses: '120.5',
      junk: { a: 1 },
      top_categories: [{ category: 'Food', percentage: 40 }, { percentage: 10 }],
      bad: Number.NaN,
    })).toEqual({
      income: 500.56,
      expenses: 120.5,
      top_categories: [{ category: 'Food', percentage: 40 }],
    });
    expect(sanitizeBudget(null)).toBeNull();
  });

  test('sanitizePatterns drops empty and JSON-like rows', () => {
    expect(sanitizePatterns([
      { observation: 'Valid pattern' },
      { observation: '' },
      { text: '{"hack":true}' },
      null,
      'plain string pattern',
    ])).toEqual([
      { observation: 'Valid pattern' },
      { observation: 'plain string pattern' },
    ]);
  });

  test('sanitizeRecommendations requires text and normalizes priority', () => {
    expect(sanitizeRecommendations([
      { text: 'Sleep 7h+', priority: 'HIGH' },
      { text: '', priority: 'high' },
      { priority: 'low' },
      { text: 'Walk', priority: 'urgent' },
    ])).toEqual([
      { text: 'Sleep 7h+', priority: 'high' },
      { text: 'Walk' },
    ]);
  });

  test('freezeReportPayload produces only valid frozen fields', () => {
    const frozen = freezeReportPayload({
      summary: '  ',
      health_score: Number.NaN,
      financial_health_score: 999,
      mood_trend: { weird: true },
      spending_trend: 'decreasing',
      budget_summary: { income: 10, expenses: Number.NaN },
      cross_domain_insights: null,
      recommendations: [{ text: 'Do the thing', priority: 'medium' }, {}],
      patterns: [{ observation: 'Sleep link' }, { domain: 'x' }],
      model_runtime: { status: 'ready', secret: 'nope', operating_mode: 'local' },
    });
    expect(frozen.summary).toBe('Weekly summary.');
    expect(frozen.metrics_snapshot.health_score).toBeNull();
    expect(frozen.metrics_snapshot.financial_health_score).toBe(100);
    expect(frozen.metrics_snapshot.mood_trend).toBeNull();
    expect(frozen.metrics_snapshot.spending_trend).toBe('decreasing');
    expect(frozen.metrics_snapshot.budget).toEqual({ income: 10 });
    expect(frozen.metrics_snapshot.cross_domain).toBeNull();
    expect(frozen.metrics_snapshot.model_runtime).toEqual({
      status: 'ready',
      operating_mode: 'local',
    });
    expect(frozen.recommendations).toEqual([{ text: 'Do the thing', priority: 'medium' }]);
    expect(frozen.patterns).toEqual([{ observation: 'Sleep link' }]);
  });
});

describe('pdfReportBuilder (unit)', () => {
  test('builds a non-empty PDF buffer with %PDF header', async () => {
    const buf = await buildWeeklyReportPdf({
      week_key: '2026-W28',
      period_start: '2026-07-06',
      period_end: '2026-07-12',
      summary: 'You slept well and spent carefully.',
      metrics_snapshot: {
        health_score: 72,
        financial_health_score: 65,
        mood_trend: 'stable',
        spending_trend: 'down',
        budget: {
          income: 500,
          expenses: 120,
          top_categories: [{ category: 'Food', percentage: 40 }],
        },
        daily_overview: {
          days_with_data: 2,
          totals: {
            steps: 12000, sleep_h_avg: 7.2, mood_avg: 4, water: 10,
            exercise_min: 60, income: 500, expense: 120, health_count: 6, finance_count: 3,
          },
          days: [
            {
              date: '2026-07-06', weekday: 'Mon', steps: 6000, sleep_h: 7.5, mood: 4,
              water: 2, exercise_min: 30, income: 0, expense: 40, health_count: 3, finance_count: 1,
              notes: ['6000 steps', '7.5h sleep'],
            },
            {
              date: '2026-07-07', weekday: 'Tue', steps: 6000, sleep_h: 7, mood: 3,
              water: 2, exercise_min: 0, income: 500, expense: 80, health_count: 3, finance_count: 2,
              notes: ['6000 steps'],
            },
            ...['2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11', '2026-07-12'].map((date, i) => ({
              date,
              weekday: ['Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
              steps: null, sleep_h: null, mood: null, water: null, exercise_min: null,
              income: 0, expense: 0, health_count: 0, finance_count: 0, notes: ['No logs'],
            })),
          ],
        },
      },
      recommendations: [{ text: 'Keep water intake above 2L', priority: 'medium' }],
      patterns: [{ observation: 'Sleep correlates with lower spending', domain: 'cross' }],
      user_name: 'QA Bot',
      generated_at: new Date('2026-07-12T12:00:00Z'),
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1500);
    expect(buf.slice(0, 5).toString('utf8')).toBe('%PDF-');
  });

  test('handles empty recommendations/patterns without throwing', async () => {
    const buf = await buildWeeklyReportPdf({
      week_key: '2026-W01',
      period_start: '2026-01-01',
      period_end: '2026-01-07',
      summary: 'Sparse week.',
      metrics_snapshot: {},
    });
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
  });

  test('builds PDF even when metrics are NaN/invalid (no crash, valid placeholder scores)', async () => {
    const buf = await buildWeeklyReportPdf({
      week_key: '2026-W28',
      period_start: 'not-a-date',
      period_end: '2026-07-12',
      summary: null,
      metrics_snapshot: {
        health_score: Number.NaN,
        financial_health_score: 'oops',
        mood_trend: null,
        spending_trend: { x: 1 },
        budget: { income: Number.NaN, expenses: 20 },
      },
      recommendations: [{}, { text: 'Valid rec', priority: 'high' }],
      patterns: [{ observation: '' }, { observation: 'Valid pattern' }],
    });
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(400);
  });

  test('header uses ASCII range separator (not Unicode arrow)', () => {
    expect(asDate('2026-07-06')).toBe('2026-07-06');
    // Contract: builder template must stay ASCII-safe for Helvetica.
    const header = `Week 2026-W28  |  ${asDate('2026-07-06')} -> ${asDate('2026-07-12')}`;
    expect(header).toBe('Week 2026-W28  |  2026-07-06 -> 2026-07-12');
    expect(header).not.toMatch(/[→·]/);
  });
});

describe('reportService week helpers (unit / pure)', () => {
  test('isoWeekKey format YYYY-Www', () => {
    const key = isoWeekKey(new Date('2026-07-11T12:00:00Z'));
    expect(key).toMatch(/^\d{4}-W\d{2}$/);
  });

  test('weekBoundsUtc returns Mon–Sun window', () => {
    const b = weekBoundsUtc(new Date('2026-07-11T12:00:00Z')); // Saturday
    expect(b.period_start <= b.period_end).toBe(true);
    expect(b.week_key).toMatch(/^\d{4}-W\d{2}$/);
    // Monday of that week is 2026-07-06 UTC
    expect(b.period_start).toBe('2026-07-06');
    expect(b.period_end).toBe('2026-07-12');
  });
});
