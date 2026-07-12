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
    expect(mon.notes.join(' ')).toMatch(/Low mood 2\/10/);
    expect(mon.top_expense_category).toBe('Food');
  });

  test('mood labels use 1–10 scale (not /5)', () => {
    const overview = buildDailyOverviewFromRows({
      periodStart: '2026-07-06',
      periodEnd: '2026-07-12',
      healthRows: [
        { type: 'mood', value: 8, logged_at: '2026-07-06T12:00:00.000Z' },
      ],
      financeRows: [],
    });
    const mon = overview.days[0];
    expect(mon.headline).toMatch(/Good mood day \(8\/10\)/);
    expect(mon.notes.join(' ')).toMatch(/Good mood 8\/10/);
    expect(mon.notes.join(' ')).not.toMatch(/\/5/);
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
    // Unlogged money is null — same rule as unlogged steps (not fake 0).
    expect(overview.days[3].income).toBeNull();
    expect(overview.days[3].expense).toBeNull();
    expect(overview.totals.income).toBeNull();
    expect(overview.totals.expense).toBeNull();
    expect(overview.totals.steps).toBeNull();
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
    expect(clean.totals.expense).toBeNull(); // NaN → missing, not 0
    expect(clean.totals.income).toBe(5);
  });

  test('CRITICAL: null metrics stay null (Number(null) must not become 0)', () => {
    const clean = sanitizeDailyOverview({
      days: [
        {
          date: '2026-07-06', weekday: 'Mon',
          steps: null, sleep_h: null, mood: null, water: null,
          exercise_min: null, heart_rate: null, nutrition: null,
          income: null, expense: null, health_count: 0, finance_count: 0,
          notes: ['No logs'],
        },
        {
          date: '2026-07-07', weekday: 'Tue',
          steps: 8000, sleep_h: null, mood: 7, water: null,
          exercise_min: null, heart_rate: null, nutrition: null,
          income: null, expense: null, health_count: 2, finance_count: 0,
          notes: ['8000 steps'],
        },
      ],
      totals: {
        steps: 8000, sleep_h_avg: null, mood_avg: 7, water: null,
        exercise_min: null, income: null, expense: null, health_count: 2, finance_count: 0,
      },
      days_with_data: 1,
    });
    // Empty day: ALL unlogged metrics null (health + money).
    expect(clean.days[0].steps).toBeNull();
    expect(clean.days[0].sleep_h).toBeNull();
    expect(clean.days[0].mood).toBeNull();
    expect(clean.days[0].water).toBeNull();
    expect(clean.days[0].exercise_min).toBeNull();
    expect(clean.days[0].income).toBeNull();
    expect(clean.days[0].expense).toBeNull();
    // Day with real steps keeps the value; unlogged money stays null.
    expect(clean.days[1].steps).toBe(8000);
    expect(clean.days[1].mood).toBe(7);
    expect(clean.days[1].sleep_h).toBeNull();
    expect(clean.days[1].income).toBeNull();
    // Totals: null stays null (not 0).
    expect(clean.totals.steps).toBe(8000);
    expect(clean.totals.sleep_h_avg).toBeNull();
    expect(clean.totals.water).toBeNull();
    expect(clean.totals.exercise_min).toBeNull();
    expect(clean.totals.mood_avg).toBe(7);
    expect(clean.totals.income).toBeNull();
    expect(clean.totals.expense).toBeNull();
  });

  test('money null vs health null is consistent after build + freeze', () => {
    const { freezeReportPayload } = require('../server/services/pdfReportBuilder');
    const overview = buildDailyOverviewFromRows({
      periodStart: '2026-07-06',
      periodEnd: '2026-07-12',
      healthRows: [
        { type: 'steps', value: 5000, logged_at: '2026-07-06T10:00:00.000Z' },
      ],
      financeRows: [
        { type: 'expense', amount: 20, logged_at: '2026-07-07T10:00:00.000Z' },
      ],
    });
    // Mon: steps only → expense null, income null
    expect(overview.days[0].steps).toBe(5000);
    expect(overview.days[0].expense).toBeNull();
    expect(overview.days[0].income).toBeNull();
    // Tue: expense only → steps null
    expect(overview.days[1].steps).toBeNull();
    expect(overview.days[1].expense).toBe(20);
    expect(overview.days[1].income).toBeNull();
    // Wed empty: everything null
    expect(overview.days[2].steps).toBeNull();
    expect(overview.days[2].expense).toBeNull();

    const frozen = freezeReportPayload({ daily_overview: overview, summary: 'x' });
    const d = frozen.metrics_snapshot.daily_overview;
    expect(d.days[0].expense).toBeNull();
    expect(d.days[1].steps).toBeNull();
    expect(d.days[1].expense).toBe(20);
    expect(d.totals.income).toBeNull();
    expect(d.totals.expense).toBe(20);
    expect(d.totals.steps).toBe(5000);
  });

  test('freeze path keeps real steps and does not invent zeros for missing fields', () => {
    const { freezeReportPayload } = require('../server/services/pdfReportBuilder');
    const overview = buildDailyOverviewFromRows({
      periodStart: '2026-07-06',
      periodEnd: '2026-07-12',
      healthRows: [
        { type: 'steps', value: 8000, logged_at: '2026-07-07T10:00:00.000Z' },
      ],
      financeRows: [],
    });
    const frozen = freezeReportPayload({ daily_overview: overview, health_score: 70, summary: 'ok' });
    const daily = frozen.metrics_snapshot.daily_overview;
    const mon = daily.days[0];
    const tue = daily.days[1];
    expect(mon.steps).toBeNull(); // no logs Monday
    expect(tue.steps).toBe(8000);
    expect(daily.totals.steps).toBe(8000);
    expect(daily.totals.sleep_h_avg).toBeNull();
  });
});
