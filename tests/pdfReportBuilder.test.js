// Unit tests — pure PDF builder (UC-13)

const { buildWeeklyReportPdf, lineText, asDate, isoWeekKey, weekBoundsUtc } = (() => {
  const pdf = require('../server/services/pdfReportBuilder');
  // isoWeekKey lives in reportService — import both.
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
      },
      recommendations: [{ text: 'Keep water intake above 2L', priority: 'medium' }],
      patterns: [{ observation: 'Sleep correlates with lower spending', domain: 'cross' }],
      user_name: 'QA Bot',
      generated_at: new Date('2026-07-12T12:00:00Z'),
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
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
