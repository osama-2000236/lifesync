// longHorizon.js
// ============================================
// Multi-year companion awareness from rows already in context.
// No extra DB hits — pure math over health/finance plain rows.
// Use cases: week-over-week, month-over-month, streaks, "second mind" digs.
// ============================================

const { startOfUtcDay, isSameUtcDay } = require('./sameDayCoverage');

const MS_DAY = 24 * 60 * 60 * 1000;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const dayKey = (d) => {
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return null;
  }
};

const inRange = (loggedAt, start, end) => {
  const t = new Date(loggedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= start.getTime() && t < end.getTime();
};

const avg = (vals) => {
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
};

const sum = (vals) => vals.reduce((a, b) => a + b, 0);

const pctChange = (curr, prev) => {
  if (curr == null || prev == null) return null;
  if (prev === 0) return curr === 0 ? 0 : 100;
  return Math.round(((curr - prev) / Math.abs(prev)) * 1000) / 10;
};

const labelDelta = (pct) => {
  if (pct == null) return null;
  if (pct > 12) return 'up';
  if (pct < -12) return 'down';
  return 'flat';
};

/**
 * @param {Array} healthRows plain health logs (with type, value, logged_at)
 * @param {Array} financeRows plain finance logs (with type, amount, logged_at)
 * @param {{ member_since?: Date|string|null }} profile
 * @param {Date} [now]
 */
const buildHorizon = (healthRows = [], financeRows = [], profile = {}, now = new Date()) => {
  const end = now;
  const day0 = startOfUtcDay(now);
  const week0 = new Date(day0.getTime() - 7 * MS_DAY);
  const week1 = new Date(day0.getTime() - 14 * MS_DAY);
  const month0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const month1 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const month1End = month0;

  const h = Array.isArray(healthRows) ? healthRows : [];
  const f = Array.isArray(financeRows) ? financeRows : [];

  const healthIn = (start, endEx, type) => h
    .filter((r) => r.type === type && inRange(r.logged_at, start, endEx))
    .map((r) => num(r.value))
    .filter((v) => v != null);

  const expenseIn = (start, endEx) => f
    .filter((r) => (r.type === 'expense' || !r.type) && inRange(r.logged_at, start, endEx))
    .map((r) => num(r.amount))
    .filter((v) => v != null && v > 0);

  const incomeIn = (start, endEx) => f
    .filter((r) => r.type === 'income' && inRange(r.logged_at, start, endEx))
    .map((r) => num(r.amount))
    .filter((v) => v != null && v > 0);

  const sleepThis = avg(healthIn(week0, end, 'sleep'));
  const sleepLast = avg(healthIn(week1, week0, 'sleep'));
  const moodThis = avg(healthIn(week0, end, 'mood'));
  const moodLast = avg(healthIn(week1, week0, 'mood'));
  const spendThisW = sum(expenseIn(week0, end));
  const spendLastW = sum(expenseIn(week1, week0));
  const spendThisM = sum(expenseIn(month0, end));
  const spendLastM = sum(expenseIn(month1, month1End));
  const incomeThisW = sum(incomeIn(week0, end));
  const incomeThisM = sum(incomeIn(month0, end));

  // Logging streak: consecutive UTC days with any health or finance log (ending today or yesterday).
  const activeDays = new Set();
  [...h, ...f].forEach((r) => {
    const k = dayKey(r.logged_at);
    if (k) activeDays.add(k);
  });
  let streak = 0;
  for (let i = 0; i < 400; i += 1) {
    const k = dayKey(new Date(day0.getTime() - i * MS_DAY));
    if (activeDays.has(k)) streak += 1;
    else if (i > 0) break; // allow starting from yesterday if today empty
    else break;
  }
  // If today empty, count streak ending yesterday
  if (!activeDays.has(dayKey(day0)) && streak === 0) {
    for (let i = 1; i < 400; i += 1) {
      const k = dayKey(new Date(day0.getTime() - i * MS_DAY));
      if (activeDays.has(k)) streak += 1;
      else break;
    }
  }

  // Last seen per health type + finance types (for "last logged X days ago")
  const lastSeen = {};
  const bump = (key, at) => {
    if (!at) return;
    const t = new Date(at).getTime();
    if (!Number.isFinite(t)) return;
    if (!lastSeen[key] || t > lastSeen[key]) lastSeen[key] = t;
  };
  h.forEach((r) => bump(`health.${r.type}`, r.logged_at));
  f.forEach((r) => bump(`finance.${r.type || 'expense'}`, r.logged_at));

  const daysSince = (key) => {
    if (!lastSeen[key]) return null;
    return Math.floor((day0.getTime() - startOfUtcDay(new Date(lastSeen[key])).getTime()) / MS_DAY);
  };

  const memberSince = profile?.member_since || profile?.created_at || null;
  const daysTogether = memberSince
    ? Math.max(0, Math.floor((day0.getTime() - startOfUtcDay(new Date(memberSince)).getTime()) / MS_DAY))
    : null;

  const activeDays30 = [...activeDays].filter((k) => {
    const t = new Date(`${k}T00:00:00.000Z`).getTime();
    return t >= day0.getTime() - 30 * MS_DAY;
  }).length;

  // Week/month coverage sets (for dig cadence beyond same-day)
  const weekHealth = new Set();
  const weekFinance = new Set();
  const monthFinance = new Set();
  h.forEach((r) => {
    if (r.type && inRange(r.logged_at, week0, end)) weekHealth.add(r.type);
  });
  f.forEach((r) => {
    const typ = r.type || 'expense';
    if (inRange(r.logged_at, week0, end)) weekFinance.add(typ);
    if (inRange(r.logged_at, month0, end)) monthFinance.add(typ);
  });

  const sleepDelta = pctChange(sleepThis, sleepLast);
  const moodDelta = pctChange(moodThis, moodLast);
  const spendWDelta = pctChange(spendThisW || null, spendLastW || null);
  const spendMDelta = pctChange(spendThisM || null, spendLastM || null);

  // Compact XD second-mind hints (data-only, no invent)
  const xd_hints = [];
  if (sleepThis != null && sleepThis < 6.5 && spendThisW > 0 && spendLastW > 0 && spendWDelta != null && spendWDelta > 15) {
    xd_hints.push('sleep low this week while spending is up vs last week — classic sleep↔spend pattern');
  }
  if (moodThis != null && moodThis <= 4 && spendThisW > spendLastW && spendLastW > 0) {
    xd_hints.push('mood softer this week with higher spending — worth a gentle check-in');
  }
  if (moodThis != null && moodThis >= 7 && weekHealth.has('exercise')) {
    xd_hints.push('mood solid with exercise logged this week — reinforce the link');
  }

  return {
    days_together: daysTogether,
    active_days_30: activeDays30,
    log_streak_days: streak,
    total_health_rows: h.length,
    total_finance_rows: f.length,
    week: {
      sleep_avg: sleepThis,
      sleep_avg_prev: sleepLast,
      sleep_delta_pct: sleepDelta,
      sleep_trend: labelDelta(sleepDelta),
      mood_avg: moodThis,
      mood_avg_prev: moodLast,
      mood_delta_pct: moodDelta,
      mood_trend: labelDelta(moodDelta),
      expense_total: Math.round(spendThisW * 100) / 100,
      expense_prev: Math.round(spendLastW * 100) / 100,
      expense_delta_pct: spendWDelta,
      expense_trend: labelDelta(spendWDelta),
      income_total: Math.round(incomeThisW * 100) / 100,
    },
    month: {
      expense_total: Math.round(spendThisM * 100) / 100,
      expense_prev: Math.round(spendLastM * 100) / 100,
      expense_delta_pct: spendMDelta,
      expense_trend: labelDelta(spendMDelta),
      income_total: Math.round(incomeThisM * 100) / 100,
    },
    last_days_ago: {
      sleep: daysSince('health.sleep'),
      mood: daysSince('health.mood'),
      steps: daysSince('health.steps'),
      exercise: daysSince('health.exercise'),
      water: daysSince('health.water'),
      expense: daysSince('finance.expense'),
      income: daysSince('finance.income'),
    },
    coverage_week: {
      health: [...weekHealth],
      finance: [...weekFinance],
    },
    coverage_month: {
      finance: [...monthFinance],
    },
    xd_hints,
  };
};

/** One dense English line for system prompt / summary. */
const formatHorizonLine = (horizon, ar = false) => {
  if (!horizon) return '';
  const parts = [];
  if (horizon.days_together != null && horizon.days_together >= 1) {
    parts.push(ar
      ? `معك منذ ${horizon.days_together} يومًا`
      : `${horizon.days_together}d together`);
  }
  if (horizon.log_streak_days >= 2) {
    parts.push(ar
      ? `سلسلة تسجيل ${horizon.log_streak_days} أيام`
      : `${horizon.log_streak_days}-day log streak`);
  }
  if (horizon.active_days_30 >= 1) {
    parts.push(ar
      ? `${horizon.active_days_30}/30 يوم نشط`
      : `${horizon.active_days_30}/30 active days`);
  }
  const w = horizon.week || {};
  if (w.sleep_avg != null && w.sleep_trend) {
    parts.push(ar
      ? `نوم هذا الأسبوع ${w.sleep_avg}س (${w.sleep_trend === 'up' ? '↑' : w.sleep_trend === 'down' ? '↓' : '→'} ${w.sleep_delta_pct ?? 0}%)`
      : `sleep wk ${w.sleep_avg}h (${w.sleep_trend} ${w.sleep_delta_pct ?? 0}% vs prior)`);
  }
  if (w.mood_avg != null && w.mood_trend) {
    parts.push(ar
      ? `مزاج ${w.mood_avg}/10 (${w.mood_trend})`
      : `mood wk ${w.mood_avg}/10 (${w.mood_trend})`);
  }
  if (w.expense_total > 0) {
    parts.push(ar
      ? `إنفاق أسبوعي ${w.expense_total} (${w.expense_trend || '→'} ${w.expense_delta_pct ?? 0}%)`
      : `spend wk ${w.expense_total} (${w.expense_trend || 'flat'} ${w.expense_delta_pct ?? 0}% vs prior)`);
  }
  const m = horizon.month || {};
  if (m.expense_total > 0 && (m.expense_prev > 0 || m.expense_delta_pct != null)) {
    parts.push(ar
      ? `إنفاق شهري ${m.expense_total} vs السابق ${m.expense_prev} (${m.expense_delta_pct ?? 0}%)`
      : `spend mo ${m.expense_total} vs prior ${m.expense_prev} (${m.expense_delta_pct ?? 0}%)`);
  }
  if (horizon.xd_hints?.length) {
    parts.push(ar ? `إشارة عبر-المجال: ${horizon.xd_hints[0]}` : `XD: ${horizon.xd_hints[0]}`);
  }
  if (!parts.length) return '';
  return ar
    ? `أفق طويل المدى: ${parts.join('؛ ')}.`
    : `LONG-HORIZON: ${parts.join('; ')}.`;
};

/**
 * Week/month cadence: metrics that should not be re-dug this week/month.
 * Income: week. Expense dig for "weekly picture": week. Daily metrics: day only (caller).
 */
const weekMonthSkip = (horizon = {}) => {
  const weekH = new Set(horizon.coverage_week?.health || []);
  const weekF = new Set(horizon.coverage_week?.finance || []);
  const monthF = new Set(horizon.coverage_month?.finance || []);
  return {
    // re-ask sleep only if not in last 1 day handled elsewhere; weekly income skip if week has income
    skipIncomeWeek: weekF.has('income') || (horizon.week?.income_total > 0),
    skipExpenseWeekSummary: weekF.has('expense') && (horizon.week?.expense_total > 0),
    skipBudgetMonth: monthF.has('expense') && monthF.has('income'),
    weekHealth: weekH,
    weekFinance: weekF,
  };
};

module.exports = {
  buildHorizon,
  formatHorizonLine,
  weekMonthSkip,
  pctChange,
  isSameUtcDay,
};
