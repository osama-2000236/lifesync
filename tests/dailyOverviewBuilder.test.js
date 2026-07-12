// Unit tests — ISO-week daily overview (fact-based log aggregation)

const {
  buildDailyOverviewFromRows,
  enumerateDays,
  sanitizeDailyOverview,
} = require('../server/services/dailyOverviewBuilder');

describe('dailyOverviewBuilder', () => {
  test('enumerateDays returns Mon–Sun inclusive for a normal week', () => {
    const days = enumerateDays('2026-07-06', '2026-07-12');
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-07-06');
    expect(days[6]).toBe('2026-07-12');
  });

  test('builds one row per day with health + finance aggregates', () => {
    const overview = buildDailyOverviewFromRows({
      periodStart: '2026-07-06',
      periodEnd: '2026-07-12',
      healthRows: [
        { type: 'steps', value: 4000, logged_at: '2026-07-06T10:00:00.000Z' },
        { type: 'steps', value: 2000, logged_at: '2026-07-06T18:00:00.000Z' },
        { type: 'sleep', value: 7.5, logged_at: '2026-07-06T23:00:00.000Z' },
        { type: 'mood', value: 4, logged_at: '2026-07-07T12:00:00.000Z' },
        { type: 'water', value: 2, logged_at: '2026-07-07T15:00:00.000Z' },
        { type: 'exercise', value: 30, duration: 45, logged_at: '2026-07-08T09:00:00.000Z' },
      ],
      financeRows: [
        { type: 'expense', amount: 12.5, logged_at: '2026-07-06T14:00:00.000Z' },
        { type: 'income', amount: 100, logged_at: '2026-07-07T09:00:00.000Z' },
        { type: 'expense', amount: 5, logged_at: '2026-07-07T20:00:00.000Z' },
      ],
    });

    expect(overview.days).toHaveLength(7);
    expect(overview.days[0].weekday).toBe('Mon');
    expect(overview.days[0].steps).toBe(6000);
    expect(overview.days[0].sleep_h).toBe(7.5);
    expect(overview.days[0].expense).toBe(12.5);
    expect(overview.days[1].mood).toBe(4);
    expect(overview.days[1].income).toBe(100);
    expect(overview.days[1].expense).toBe(5);
    expect(overview.days[2].exercise_min).toBe(45);
    expect(overview.days_with_data).toBe(3);
    expect(overview.totals.steps).toBe(6000);
    expect(overview.totals.income).toBe(100);
    expect(overview.totals.expense).toBe(17.5);
    expect(overview.days[0].notes.join(' ')).toMatch(/steps/i);
    expect(overview.days[0].headline).toBeTruthy();
    expect(overview.days[0].notes.length).toBeGreaterThan(0);
  });

  test('rich notes flag short sleep + spending and net money', () => {
    const overview = buildDailyOverviewFromRows({
      periodStart: '2026-07-06',
      periodEnd: '2026-07-12',
      healthRows: [
        { type: 'sleep', value: 5, logged_at: '2026-07-06T23:00:00.000Z' },
        { type: 'mood', value: 2, logged_at: '2026-07-06T12:00:00.000Z' },
      ],
      financeRows: [
        { type: 'expense', amount: 40, category_name: 'Food', logged_at: '2026-07-06T14:00:00.000Z' },
      ],
    });
    const mon = overview.days[0];
    expect(mon.headline).toMatch(/short sleep/i);
    expect(mon.notes.join(' ')).toMatch(/Low sleep \+ spending/i);
    expect(mon.notes.join(' ')).toMatch(/Food|Spent/);
    expect(mon.notes.join(' ')).toMatch(/Net -/);
    expect(mon.top_expense_category).toBe('Food');
  });

  test('empty week still returns 7 days marked No logs', () => {
    const overview = buildDailyOverviewFromRows({
      periodStart: '2026-07-06',
      periodEnd: '2026-07-12',
      healthRows: [],
      financeRows: [],
    });
    expect(overview.days).toHaveLength(7);
    expect(overview.days_with_data).toBe(0);
    expect(overview.days[3].headline).toMatch(/No logs/i);
    expect(overview.days[3].notes.join(' ')).toMatch(/No health|No logs/i);
  });

  test('sanitizeDailyOverview drops invalid days and keeps metrics finite', () => {
    const clean = sanitizeDailyOverview({
      days: [
        { date: '2026-07-06', weekday: 'Mon', steps: 1000.9, expense: 10, notes: ['ok'] },
        { date: 'bad', steps: 1 },
        null,
      ],
      totals: { steps: 1000.9, income: 5, expense: Number.NaN },
      days_with_data: 1,
    });
    expect(clean.days).toHaveLength(1);
    expect(clean.days[0].steps).toBe(1001); // Math.round(1000.9)
    expect(clean.totals.expense).toBe(0);
  });
});
