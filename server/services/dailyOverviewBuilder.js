// server/services/dailyOverviewBuilder.js
// ============================================
// ISO-week daily health + finance overview (fact-based from logs).
// Pure aggregation — no AI. Used by weekly PDF freeze.
// ============================================

const { Op } = require('sequelize');
const HealthLog = require('../models/HealthLog');
const FinancialLog = require('../models/FinancialLog');

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const finite = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

const dayKey = (loggedAt) => {
  const d = loggedAt instanceof Date ? loggedAt : new Date(loggedAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

/** List YYYY-MM-DD from period_start through period_end (UTC, inclusive). */
const enumerateDays = (periodStart, periodEnd) => {
  const days = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    return days;
  }
  const cur = new Date(`${periodStart}T00:00:00.000Z`);
  const end = new Date(`${periodEnd}T00:00:00.000Z`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime()) || cur > end) return days;
  // Cap at 14 days so a bad window cannot explode the PDF.
  for (let i = 0; i < 14 && cur <= end; i++) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
};

const emptyDay = (date) => {
  const d = new Date(`${date}T00:00:00.000Z`);
  return {
    date,
    weekday: WEEKDAYS[d.getUTCDay()] || '—',
    steps: null,
    sleep_h: null,
    mood: null,
    water: null,
    exercise_min: null,
    heart_rate: null,
    nutrition: null,
    income: 0,
    expense: 0,
    health_count: 0,
    finance_count: 0,
    notes: [],
  };
};

/**
 * Aggregate raw log rows into one day bucket (mutates day).
 */
const foldHealth = (day, row) => {
  const type = row.type;
  const value = finite(row.value);
  if (value == null) return;
  day.health_count += 1;
  switch (type) {
    case 'steps':
      day.steps = (day.steps || 0) + value;
      break;
    case 'sleep': {
      // Prefer duration (minutes) when present; else value as hours.
      const hours = row.duration != null && finite(row.duration) != null
        ? finite(row.duration) / 60
        : value;
      if (day._sleepSum == null) { day._sleepSum = 0; day._sleepN = 0; }
      day._sleepSum += hours;
      day._sleepN += 1;
      break;
    }
    case 'mood':
      if (day._moodSum == null) { day._moodSum = 0; day._moodN = 0; }
      day._moodSum += value;
      day._moodN += 1;
      break;
    case 'water':
      day.water = (day.water || 0) + value;
      break;
    case 'exercise': {
      const mins = row.duration != null && finite(row.duration) != null
        ? finite(row.duration)
        : value;
      day.exercise_min = (day.exercise_min || 0) + mins;
      break;
    }
    case 'heart_rate':
      if (day._hrSum == null) { day._hrSum = 0; day._hrN = 0; }
      day._hrSum += value;
      day._hrN += 1;
      break;
    case 'nutrition':
      day.nutrition = (day.nutrition || 0) + value;
      break;
    default:
      break;
  }
};

const foldFinance = (day, row) => {
  const amount = finite(row.amount);
  if (amount == null || amount < 0) return;
  day.finance_count += 1;
  if (row.type === 'income') day.income = round2(day.income + amount);
  else if (row.type === 'expense') day.expense = round2(day.expense + amount);
};

const finalizeDay = (day) => {
  if (day._sleepN) day.sleep_h = round1(day._sleepSum / day._sleepN);
  if (day._moodN) day.mood = round1(day._moodSum / day._moodN);
  if (day._hrN) day.heart_rate = Math.round(day._hrSum / day._hrN);
  if (day.steps != null) day.steps = Math.round(day.steps);
  if (day.water != null) day.water = round1(day.water);
  if (day.exercise_min != null) day.exercise_min = Math.round(day.exercise_min);
  if (day.nutrition != null) day.nutrition = Math.round(day.nutrition);
  day.income = round2(day.income || 0);
  day.expense = round2(day.expense || 0);

  // Short fact highlights for PDF (max 4).
  const notes = [];
  if (day.steps != null && day.steps > 0) notes.push(`${day.steps.toLocaleString('en-US')} steps`);
  if (day.sleep_h != null) notes.push(`${day.sleep_h}h sleep`);
  if (day.mood != null) notes.push(`mood ${day.mood}/5`);
  if (day.water != null && day.water > 0) notes.push(`${day.water} water`);
  if (day.exercise_min != null && day.exercise_min > 0) notes.push(`${day.exercise_min} min exercise`);
  if (day.expense > 0) notes.push(`spent ${day.expense}`);
  if (day.income > 0) notes.push(`income ${day.income}`);
  if (!notes.length && day.health_count === 0 && day.finance_count === 0) {
    notes.push('No logs');
  }
  day.notes = notes.slice(0, 5);

  delete day._sleepSum;
  delete day._sleepN;
  delete day._moodSum;
  delete day._moodN;
  delete day._hrSum;
  delete day._hrN;
  return day;
};

/**
 * Pure: build 7-day (or N-day) overview from log rows.
 * @returns {{ days: object[], totals: object, days_with_data: number }}
 */
const buildDailyOverviewFromRows = ({ periodStart, periodEnd, healthRows = [], financeRows = [] }) => {
  const keys = enumerateDays(periodStart, periodEnd);
  const map = new Map(keys.map((k) => [k, emptyDay(k)]));

  for (const row of healthRows) {
    const k = dayKey(row.logged_at);
    if (!k || !map.has(k)) continue;
    foldHealth(map.get(k), row);
  }
  for (const row of financeRows) {
    const k = dayKey(row.logged_at);
    if (!k || !map.has(k)) continue;
    foldFinance(map.get(k), row);
  }

  const days = keys.map((k) => finalizeDay(map.get(k)));
  const totals = {
    steps: null,
    sleep_h_avg: null,
    mood_avg: null,
    water: null,
    exercise_min: null,
    income: 0,
    expense: 0,
    health_count: 0,
    finance_count: 0,
  };
  let sleepSum = 0;
  let sleepN = 0;
  let moodSum = 0;
  let moodN = 0;
  let stepsSum = 0;
  let stepsN = 0;
  let waterSum = 0;
  let waterN = 0;
  let exSum = 0;
  let exN = 0;

  for (const d of days) {
    totals.income = round2(totals.income + d.income);
    totals.expense = round2(totals.expense + d.expense);
    totals.health_count += d.health_count;
    totals.finance_count += d.finance_count;
    if (d.steps != null) { stepsSum += d.steps; stepsN += 1; }
    if (d.sleep_h != null) { sleepSum += d.sleep_h; sleepN += 1; }
    if (d.mood != null) { moodSum += d.mood; moodN += 1; }
    if (d.water != null) { waterSum += d.water; waterN += 1; }
    if (d.exercise_min != null) { exSum += d.exercise_min; exN += 1; }
  }
  if (stepsN) totals.steps = Math.round(stepsSum);
  if (sleepN) totals.sleep_h_avg = round1(sleepSum / sleepN);
  if (moodN) totals.mood_avg = round1(moodSum / moodN);
  if (waterN) totals.water = round1(waterSum);
  if (exN) totals.exercise_min = Math.round(exSum);

  const days_with_data = days.filter((d) => d.health_count > 0 || d.finance_count > 0).length;
  return { days, totals, days_with_data, period_start: periodStart, period_end: periodEnd };
};

/**
 * Load logs for ISO week bounds and build overview.
 */
const buildDailyOverviewForUser = async (userId, periodStart, periodEnd) => {
  const start = new Date(`${periodStart}T00:00:00.000Z`);
  const endExclusive = new Date(`${periodEnd}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  const [healthRows, financeRows] = await Promise.all([
    HealthLog.findAll({
      where: {
        user_id: userId,
        logged_at: { [Op.gte]: start, [Op.lt]: endExclusive },
      },
      attributes: ['type', 'value', 'duration', 'unit', 'logged_at'],
      order: [['logged_at', 'ASC']],
      raw: true,
    }),
    FinancialLog.findAll({
      where: {
        user_id: userId,
        logged_at: { [Op.gte]: start, [Op.lt]: endExclusive },
      },
      attributes: ['type', 'amount', 'logged_at'],
      order: [['logged_at', 'ASC']],
      raw: true,
    }),
  ]);

  return buildDailyOverviewFromRows({
    periodStart,
    periodEnd,
    healthRows,
    financeRows,
  });
};

/** Drop internal junk; keep freeze-safe daily overview. */
const sanitizeDailyOverview = (overview) => {
  if (!overview || typeof overview !== 'object') return null;
  const daysIn = Array.isArray(overview.days) ? overview.days : [];
  const days = daysIn.slice(0, 14).map((d) => {
    if (!d || typeof d !== 'object') return null;
    const date = String(d.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const weekday = String(d.weekday || '').slice(0, 3) || '—';
    const num = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const notes = Array.isArray(d.notes)
      ? d.notes.map((n) => String(n).trim().slice(0, 80)).filter(Boolean).slice(0, 5)
      : [];
    return {
      date,
      weekday,
      steps: num(d.steps) != null ? Math.round(num(d.steps)) : null,
      sleep_h: num(d.sleep_h),
      mood: num(d.mood),
      water: num(d.water),
      exercise_min: num(d.exercise_min) != null ? Math.round(num(d.exercise_min)) : null,
      heart_rate: num(d.heart_rate) != null ? Math.round(num(d.heart_rate)) : null,
      nutrition: num(d.nutrition) != null ? Math.round(num(d.nutrition)) : null,
      income: round2(num(d.income) || 0),
      expense: round2(num(d.expense) || 0),
      health_count: Math.max(0, Math.round(num(d.health_count) || 0)),
      finance_count: Math.max(0, Math.round(num(d.finance_count) || 0)),
      notes,
    };
  }).filter(Boolean);

  if (!days.length) return null;

  const t = overview.totals && typeof overview.totals === 'object' ? overview.totals : {};
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    period_start: overview.period_start || days[0].date,
    period_end: overview.period_end || days[days.length - 1].date,
    days_with_data: Math.max(0, Math.round(num(overview.days_with_data) || days.filter((d) => d.health_count || d.finance_count).length)),
    totals: {
      steps: num(t.steps) != null ? Math.round(num(t.steps)) : null,
      sleep_h_avg: num(t.sleep_h_avg),
      mood_avg: num(t.mood_avg),
      water: num(t.water),
      exercise_min: num(t.exercise_min) != null ? Math.round(num(t.exercise_min)) : null,
      income: round2(num(t.income) || 0),
      expense: round2(num(t.expense) || 0),
      health_count: Math.max(0, Math.round(num(t.health_count) || 0)),
      finance_count: Math.max(0, Math.round(num(t.finance_count) || 0)),
    },
    days,
  };
};

module.exports = {
  buildDailyOverviewFromRows,
  buildDailyOverviewForUser,
  sanitizeDailyOverview,
  enumerateDays,
};
