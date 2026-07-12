// server/services/dailyOverviewBuilder.js
// ============================================
// ISO-week daily health + finance overview (fact-based from logs).
// Pure aggregation — no AI. Used by weekly PDF freeze.
// ============================================

const { Op } = require('sequelize');
const HealthLog = require('../models/HealthLog');
const FinancialLog = require('../models/FinancialLog');

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Critical: Number(null) === 0 in JS — never treat missing metrics as zero.
const finite = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
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
    top_expense_category: null,
    _expenseByCat: {},
    health_count: 0,
    finance_count: 0,
    notes: [],
    headline: null,
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
  if (row.type === 'income') {
    day.income = round2(day.income + amount);
  } else if (row.type === 'expense') {
    day.expense = round2(day.expense + amount);
    const cat = (row.category_name || row.category?.name || 'other').toString().slice(0, 40);
    day._expenseByCat[cat] = round2((day._expenseByCat[cat] || 0) + amount);
  }
};

/** Human, useful day notes — quality labels + cross signals, not raw dumps. */
const buildDayNotes = (day) => {
  if (day.health_count === 0 && day.finance_count === 0) {
    return { headline: 'No logs — quiet day', notes: ['No health or finance entries'] };
  }

  const notes = [];
  let headline = null;

  // Sleep quality
  if (day.sleep_h != null) {
    if (day.sleep_h >= 7.5) notes.push(`Solid sleep ${day.sleep_h}h`);
    else if (day.sleep_h < 6) notes.push(`Short sleep ${day.sleep_h}h`);
    else notes.push(`Sleep ${day.sleep_h}h`);
  }

  // Activity
  if (day.steps != null && day.steps > 0) {
    if (day.steps >= 10000) notes.push(`Active day ${day.steps.toLocaleString('en-US')} steps`);
    else if (day.steps < 3000) notes.push(`Low movement ${day.steps.toLocaleString('en-US')} steps`);
    else notes.push(`${day.steps.toLocaleString('en-US')} steps`);
  }
  if (day.exercise_min != null && day.exercise_min > 0) {
    notes.push(`${day.exercise_min} min exercise`);
  }

  // Mood + recovery signals (product scale is 1–10, not 1–5)
  if (day.mood != null) {
    if (day.mood >= 7) notes.push(`Good mood ${day.mood}/10`);
    else if (day.mood <= 3) notes.push(`Low mood ${day.mood}/10`);
    else notes.push(`Mood ${day.mood}/10`);
  }
  if (day.water != null && day.water > 0) {
    notes.push(day.water >= 2 ? `Hydrated ${day.water}` : `Water ${day.water}`);
  }
  if (day.heart_rate != null) notes.push(`HR ~${day.heart_rate}`);
  if (day.nutrition != null && day.nutrition > 0) notes.push(`Nutrition ${day.nutrition}`);

  // Money
  if (day.expense > 0) {
    const catBit = day.top_expense_category ? ` (${day.top_expense_category})` : '';
    notes.push(`Spent ${day.expense}${catBit}`);
  }
  if (day.income > 0) notes.push(`Income ${day.income}`);
  const net = round2((day.income || 0) - (day.expense || 0));
  if ((day.income || 0) > 0 || (day.expense || 0) > 0) {
    if (net > 0) notes.push(`Net +${net}`);
    else if (net < 0) notes.push(`Net ${net}`);
    else notes.push('Net even');
  }

  // Cross-domain day tags (facts only)
  if (day.sleep_h != null && day.sleep_h < 6 && day.expense > 0) {
    notes.push('Low sleep + spending day');
  }
  if (day.mood != null && day.mood >= 7 && day.steps != null && day.steps >= 8000) {
    notes.push('High energy day');
  }
  if (day.mood != null && day.mood <= 3 && day.expense > 0) {
    notes.push('Low mood + spending day');
  }

  // Headline = strongest single signal
  if (day.sleep_h != null && day.sleep_h < 6) headline = `Short sleep (${day.sleep_h}h)`;
  else if (day.steps != null && day.steps >= 10000) headline = `Active — ${day.steps.toLocaleString('en-US')} steps`;
  else if (day.mood != null && day.mood >= 7) headline = `Good mood day (${day.mood}/10)`;
  else if (day.expense > 0 && day.expense >= (day.income || 0)) headline = `Spend focus — ${day.expense}`;
  else if (day.income > 0) headline = `Income logged — ${day.income}`;
  else if (notes[0]) headline = notes[0];
  else headline = 'Logged day';

  return { headline, notes: notes.slice(0, 6) };
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

  // Top expense category for the day
  const cats = day._expenseByCat || {};
  let topCat = null;
  let topAmt = 0;
  for (const [name, amt] of Object.entries(cats)) {
    if (amt > topAmt) { topAmt = amt; topCat = name; }
  }
  day.top_expense_category = topCat;

  const { headline, notes } = buildDayNotes(day);
  day.headline = headline;
  day.notes = notes;

  delete day._sleepSum;
  delete day._sleepN;
  delete day._moodSum;
  delete day._moodN;
  delete day._hrSum;
  delete day._hrN;
  delete day._expenseByCat;
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
      include: [{
        association: 'category',
        attributes: ['name'],
        required: false,
      }],
      order: [['logged_at', 'ASC']],
      raw: true,
      nest: true,
    }),
  ]);

  // Normalize category name onto a flat field for pure aggregator.
  const financeNorm = financeRows.map((r) => ({
    ...r,
    category_name: r.category?.name || r['category.name'] || null,
  }));

  return buildDailyOverviewFromRows({
    periodStart,
    periodEnd,
    healthRows,
    financeRows: financeNorm,
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
    const notes = Array.isArray(d.notes)
      ? d.notes.map((n) => String(n).trim().slice(0, 100)).filter(Boolean).slice(0, 6)
      : [];
    const headline = d.headline != null
      ? String(d.headline).trim().slice(0, 120)
      : (notes[0] || null);
    const topCat = d.top_expense_category != null
      ? String(d.top_expense_category).trim().slice(0, 40)
      : null;
    const steps = finite(d.steps);
    const exercise = finite(d.exercise_min);
    const hr = finite(d.heart_rate);
    const nutrition = finite(d.nutrition);
    const healthCount = finite(d.health_count);
    const financeCount = finite(d.finance_count);
    return {
      date,
      weekday,
      steps: steps != null ? Math.round(steps) : null,
      sleep_h: finite(d.sleep_h),
      mood: finite(d.mood),
      water: finite(d.water),
      exercise_min: exercise != null ? Math.round(exercise) : null,
      heart_rate: hr != null ? Math.round(hr) : null,
      nutrition: nutrition != null ? Math.round(nutrition) : null,
      income: round2(finite(d.income) || 0),
      expense: round2(finite(d.expense) || 0),
      top_expense_category: topCat,
      health_count: Math.max(0, Math.round(healthCount || 0)),
      finance_count: Math.max(0, Math.round(financeCount || 0)),
      headline,
      notes,
    };
  }).filter(Boolean);

  if (!days.length) return null;

  const t = overview.totals && typeof overview.totals === 'object' ? overview.totals : {};
  const daysWith = finite(overview.days_with_data);
  const tSteps = finite(t.steps);
  const tEx = finite(t.exercise_min);
  const tHealth = finite(t.health_count);
  const tFinance = finite(t.finance_count);
  return {
    period_start: overview.period_start || days[0].date,
    period_end: overview.period_end || days[days.length - 1].date,
    days_with_data: Math.max(
      0,
      Math.round(daysWith != null ? daysWith : days.filter((d) => d.health_count || d.finance_count).length),
    ),
    totals: {
      steps: tSteps != null ? Math.round(tSteps) : null,
      sleep_h_avg: finite(t.sleep_h_avg),
      mood_avg: finite(t.mood_avg),
      water: finite(t.water),
      exercise_min: tEx != null ? Math.round(tEx) : null,
      income: round2(finite(t.income) || 0),
      expense: round2(finite(t.expense) || 0),
      health_count: Math.max(0, Math.round(tHealth || 0)),
      finance_count: Math.max(0, Math.round(tFinance || 0)),
    },
    days,
  };
};

module.exports = {
  buildDailyOverviewFromRows,
  buildDailyOverviewForUser,
  sanitizeDailyOverview,
  enumerateDays,
  buildDayNotes,
};
