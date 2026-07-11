// server/services/ai/goalProgress.js
// ============================================
// Honest goal progress — current computed from real logs at read time.
// set_goal only ever stores target_value; nothing updates current_value, so
// the model and dashboard saw "current: 0" forever while the set-goal reply
// promised tracking. Deriving at read time needs no hooks in the six
// log-create sites and stays correct when logs are edited or deleted.
// ============================================

const { Op, fn, col } = require('sequelize');
const { HealthLog, FinancialLog, UserGoal } = require('../../models');

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const round2 = (value) => Math.round(value * 100) / 100;

// UTC period start: daily = today 00:00Z, monthly = 1st of month.
// ponytail: weekly is a rolling 7 days; switch to ISO weeks if users ask.
const periodStart = (period, now = new Date()) => {
  if (period === 'monthly') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (period === 'weekly') return new Date(now.getTime() - 7 * 86_400_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

// Money sums are per-currency: an ILS budget must not absorb USD rows.
// No goal currency → the period's dominant currency (most money moved), never
// a cross-currency sum — 100 ILS + 50 USD is not 150 of anything.
// ponytail: dominant-currency heuristic, no FX — add real conversion when a
// user holds goals across currencies and asks for combined totals.
const dominantCurrency = (income = {}, expense = {}) => {
  const totals = {};
  for (const [cur, v] of [...Object.entries(income), ...Object.entries(expense)]) {
    totals[cur] = (totals[cur] || 0) + Math.abs(num(v));
  }
  return Object.keys(totals).reduce(
    (best, cur) => (best == null || totals[cur] > totals[best] ? cur : best),
    null,
  );
};

// Pure: current value for one goal from its period sums.
// health metric → SUM(value); budget → spend so far; savings → income − expense.
const currentFor = (goal, sums = {}) => {
  if (goal.domain === 'finance') {
    const unit = goal.unit || dominantCurrency(sums.income, sums.expense);
    const income = num(sums.income?.[unit]);
    const expense = num(sums.expense?.[unit]);
    return round2(goal.metric_type === 'budget' ? expense : income - expense);
  }
  return round2(num(sums.health?.[goal.metric_type]));
};

// Active goals with live progress. One grouped SUM per domain per distinct
// period — a user realistically holds 1–3 goals, so 1–2 cheap indexed queries.
const getGoalsWithProgress = async (userId, { limit = 12, now = new Date() } = {}) => {
  const goals = await UserGoal.findAll({
    where: { user_id: userId, status: 'active' },
    order: [['created_at', 'DESC']],
    limit,
    attributes: ['domain', 'metric_type', 'target_value', 'unit', 'period', 'end_date'],
    raw: true,
  });
  if (!goals?.length) return [];

  const sumsByPeriod = {};
  await Promise.all([...new Set(goals.map((g) => g.period))].map(async (period) => {
    const start = periodStart(period, now);
    const wantHealth = goals.some((g) => g.period === period && g.domain === 'health');
    const wantFinance = goals.some((g) => g.period === period && g.domain === 'finance');
    const [healthRows, financeRows] = await Promise.all([
      wantHealth ? HealthLog.findAll({
        attributes: ['type', [fn('SUM', col('value')), 'total']],
        where: { user_id: userId, logged_at: { [Op.gte]: start } },
        group: ['type'],
        raw: true,
      }) : [],
      wantFinance ? FinancialLog.findAll({
        attributes: ['type', 'currency', [fn('SUM', col('amount')), 'total']],
        where: { user_id: userId, logged_at: { [Op.gte]: start } },
        group: ['type', 'currency'],
        raw: true,
      }) : [],
    ]);
    const sums = { health: {}, income: {}, expense: {} };
    for (const row of healthRows) sums.health[row.type] = num(row.total);
    for (const row of financeRows) {
      sums[row.type === 'income' ? 'income' : 'expense'][row.currency || 'USD'] = num(row.total);
    }
    sumsByPeriod[period] = sums;
  }));

  return goals.map((g) => ({
    domain: g.domain,
    metric: g.metric_type,
    target: Number.isFinite(Number(g.target_value)) ? Number(g.target_value) : null,
    current: currentFor(g, sumsByPeriod[g.period]),
    unit: g.unit || null,
    period: g.period,
    end_date: g.end_date || null,
  }));
};

module.exports = {
  getGoalsWithProgress,
  _periodStart: periodStart,
  _currentFor: currentFor,
};
