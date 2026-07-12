// server/services/ai/goalProgress.js
// ============================================
// Honest goal progress — current computed from real logs at read time.
// set_goal only ever stores target_value; nothing updates current_value, so
// the model and dashboard saw "current: 0" forever while the set-goal reply
// promised tracking. Deriving at read time needs no hooks in the six
// log-create sites and stays correct when logs are edited or deleted.
//
// Finance goals: multi-currency logs are converted into the goal unit (or
// dominant currency / FX base) via fxService (Frankfurter ECB rates).
// ============================================

const { Op, fn, col } = require('sequelize');
const { HealthLog, FinancialLog, UserGoal } = require('../../models');
const { weekBoundsUtc } = require('../../utils/isoWeek');
const {
  getRatesTable,
  sumInCurrency,
  normalizeCurrency,
  isMoneyUnit,
} = require('../fxService');

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const round2 = (value) => Math.round(value * 100) / 100;

// UTC period start: daily = today 00:00Z, weekly = ISO Mon 00:00Z, monthly = 1st.
const periodStart = (period, now = new Date()) => {
  if (period === 'monthly') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (period === 'weekly') {
    const { period_start } = weekBoundsUtc(now);
    return new Date(`${period_start}T00:00:00.000Z`);
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

// Fallback reporting currency when the goal has no unit: most money moved
// (absolute income+expense). FX then converts every other currency into it.
const dominantCurrency = (income = {}, expense = {}) => {
  const totals = {};
  for (const [cur, v] of [...Object.entries(income), ...Object.entries(expense)]) {
    const code = normalizeCurrency(cur) || String(cur || '').toUpperCase();
    totals[code] = (totals[code] || 0) + Math.abs(num(v));
  }
  return Object.keys(totals).reduce(
    (best, cur) => (best == null || totals[cur] > totals[best] ? cur : best),
    null,
  );
};

/**
 * Pure: current value for one goal from its period sums + FX table.
 * health metric → SUM(value); budget → spend so far; savings → income − expense.
 * Finance amounts in other currencies are converted into the goal unit.
 *
 * @returns {{ current: number, unit: string|null, fx_missing: string[], fx_converted: boolean }}
 */
const currentFor = (goal, sums = {}, ratesTable = null) => {
  if (goal.domain === 'finance') {
    const unit = normalizeCurrency(goal.unit)
      || dominantCurrency(sums.income, sums.expense)
      || (ratesTable?.base || 'USD');

    if (ratesTable?.rates) {
      const income = sumInCurrency(sums.income, unit, ratesTable);
      const expense = sumInCurrency(sums.expense, unit, ratesTable);
      const missing = [...new Set([...income.missing, ...expense.missing])];
      const current = goal.metric_type === 'budget'
        ? expense.total
        : round2(income.total - expense.total);
      return {
        current: round2(current),
        unit,
        fx_missing: missing,
        fx_converted: income.converted || expense.converted,
      };
    }

    // No rates table at all — same-currency only (never invent a cross rate).
    const income = num(sums.income?.[unit]);
    const expense = num(sums.expense?.[unit]);
    const other = new Set([
      ...Object.keys(sums.income || {}),
      ...Object.keys(sums.expense || {}),
    ].map((c) => normalizeCurrency(c) || c).filter((c) => c && c !== unit));
    return {
      current: round2(goal.metric_type === 'budget' ? expense : income - expense),
      unit,
      fx_missing: [...other],
      fx_converted: false,
    };
  }

  return {
    current: round2(num(sums.health?.[goal.metric_type])),
    unit: goal.unit || null,
    fx_missing: [],
    fx_converted: false,
  };
};

// Active goals with live progress. One grouped SUM per domain per distinct
// period — a user realistically holds 1–3 goals, so 1–2 cheap indexed queries.
// One FX rates fetch per call (shared across all finance goals).
const getGoalsWithProgress = async (userId, {
  limit = 12,
  now = new Date(),
  ratesTable = null,
  fetchImpl,
} = {}) => {
  const goals = await UserGoal.findAll({
    where: { user_id: userId, status: 'active' },
    order: [['created_at', 'DESC']],
    limit,
    attributes: ['domain', 'metric_type', 'target_value', 'unit', 'period', 'end_date'],
    raw: true,
  });
  if (!goals?.length) return [];

  const needFx = goals.some((g) => g.domain === 'finance');
  const fx = needFx
    ? (ratesTable || await getRatesTable({ fetchImpl }))
    : null;

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
      const cur = normalizeCurrency(row.currency) || 'USD';
      const bucket = row.type === 'income' ? 'income' : 'expense';
      sums[bucket][cur] = round2((sums[bucket][cur] || 0) + num(row.total));
    }
    sumsByPeriod[period] = sums;
  }));

  return goals.map((g) => {
    const progress = currentFor(g, sumsByPeriod[g.period], fx);
    const out = {
      domain: g.domain,
      metric: g.metric_type,
      target: Number.isFinite(Number(g.target_value)) ? Number(g.target_value) : null,
      current: progress.current,
      unit: progress.unit,
      period: g.period,
      end_date: g.end_date || null,
    };
    if (g.domain === 'finance' && fx) {
      out.fx = {
        base: fx.base,
        as_of: fx.date,
        source: fx.source,
        converted: progress.fx_converted,
        missing: progress.fx_missing,
      };
      if (fx.error) out.fx.error = fx.error;
    }
    return out;
  });
};

module.exports = {
  getGoalsWithProgress,
  _periodStart: periodStart,
  _currentFor: currentFor,
  _dominantCurrency: dominantCurrency,
  _isMoneyUnit: isMoneyUnit,
};
