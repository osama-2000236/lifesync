// Long-horizon companion math — week/month trends, streak, second-mind XD
const {
  buildHorizon,
  formatHorizonLine,
  weekMonthSkip,
  pctChange,
} = require('../server/services/ai/longHorizon');
const { _buildDataGaps, _buildSystemPrompt } = require('../server/services/ai/conversationService');

const day = (offset, hour = 12) => {
  const d = new Date('2026-07-09T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + offset);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

describe('longHorizon', () => {
  const now = new Date('2026-07-09T15:00:00.000Z');

  test('pctChange and week/month spend + sleep deltas', () => {
    expect(pctChange(110, 100)).toBe(10);
    const health = [
      { type: 'sleep', value: 5, logged_at: day(0) },
      { type: 'sleep', value: 5.5, logged_at: day(-1) },
      { type: 'sleep', value: 8, logged_at: day(-8) },
      { type: 'sleep', value: 8, logged_at: day(-9) },
      { type: 'mood', value: 4, logged_at: day(0) },
      { type: 'mood', value: 7, logged_at: day(-8) },
    ];
    const finance = [
      { type: 'expense', amount: 80, logged_at: day(0) },
      { type: 'expense', amount: 40, logged_at: day(-1) },
      { type: 'expense', amount: 30, logged_at: day(-8) },
      { type: 'income', amount: 500, logged_at: day(-2) },
    ];
    const h = buildHorizon(health, finance, { member_since: '2025-01-01' }, now);
    expect(h.days_together).toBeGreaterThan(300);
    expect(h.week.sleep_avg).toBeLessThan(h.week.sleep_avg_prev);
    expect(h.week.sleep_trend).toBe('down');
    expect(h.week.expense_total).toBe(120);
    expect(h.week.expense_prev).toBe(30);
    expect(h.week.expense_trend).toBe('up');
    expect(h.week.income_total).toBe(500);
    expect(h.coverage_week.finance).toEqual(expect.arrayContaining(['expense', 'income']));
    expect(h.xd_hints.length).toBeGreaterThan(0);
    expect(formatHorizonLine(h)).toMatch(/LONG-HORIZON|spend wk|sleep wk/);
  });

  test('weekMonthSkip suppresses income dig when income this week', () => {
    const h = buildHorizon([], [{ type: 'income', amount: 100, logged_at: day(0) }], {}, now);
    const skip = weekMonthSkip(h);
    expect(skip.skipIncomeWeek).toBe(true);
  });

  test('buildDataGaps uses horizon: no income dig if week has income; trend dig when spend up', () => {
    const nowD = new Date('2026-07-09T15:00:00.000Z');
    const finance = [
      { type: 'expense', amount: 100, description: 'food', logged_at: day(0) },
      { type: 'expense', amount: 50, description: 'food', logged_at: day(-1) },
      { type: 'expense', amount: 20, logged_at: day(-8) },
      { type: 'income', amount: 400, logged_at: day(-1) },
    ];
    const health = [
      { type: 'mood', value: 3, logged_at: day(0) },
      { type: 'sleep', value: 5, logged_at: day(0) },
      { type: 'sleep', value: 5, logged_at: day(-1) },
      { type: 'sleep', value: 8, logged_at: day(-8) },
    ];
    const horizon = buildHorizon(health, finance, {}, nowD);
    const gaps = _buildDataGaps({
      horizon,
      recent_health_entries: health,
      recent_finance_entries: finance,
      memory: { count: 1, summary: 'x' },
      active_goals: [{ domain: 'finance', metric: 'budget' }],
    }, nowD);
    expect(gaps.join(' ')).not.toMatch(/mood/i);
    expect(gaps.join(' ')).not.toMatch(/income/i);
    // spend up + expense today → second-mind spend dig possible
    expect(gaps.some((g) => /second mind|higher spending|sleep dipped/i.test(g))).toBe(true);
    // Trend digs outrank raw re-collection and cite the real numbers.
    expect(gaps[0]).toMatch(/second mind/i);
    expect(gaps.join(' ')).toMatch(/\d+(\.\d+)?% WoW/);
  });

  test('system prompt includes SECOND MIND + LONG-HORIZON when horizon present', () => {
    const horizon = buildHorizon(
      [{ type: 'sleep', value: 6, logged_at: day(0) }],
      [{ type: 'expense', amount: 50, logged_at: day(0) }],
      { member_since: '2024-06-01' },
      now,
    );
    const sys = _buildSystemPrompt({ horizon, profile: { name: 'Sam', member_since: '2024-06-01' } }, [], 'en', 'm');
    expect(sys).toMatch(/SECOND MIND/);
    expect(sys).toMatch(/LONG-HORIZON|d together|streak|spend/i);
    // Trends appear ONCE, inside the data picture — no duplicate standalone line.
    expect(sys).not.toMatch(/^LONG-HORIZON:/m);
    expect(sys).toMatch(/trends: /);
  });
});
