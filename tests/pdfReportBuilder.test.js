// Unit tests — pure PDF builder (UC-13)

const { buildWeeklyReportPdf, isoWeekKey, weekBoundsUtc } = (() => {
  const pdf = require('../server/services/pdfReportBuilder');
  // isoWeekKey lives in reportService — import both.
  return {
    ...pdf,
    ...require('../server/services/reportService'),
  };
})();

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
        budget: { total_expense: 120, total_income: 500 },
      },
      recommendations: [{ text: 'Keep water intake above 2L', priority: 'medium' }],
      patterns: [{ text: 'Sleep correlates with lower spending' }],
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
