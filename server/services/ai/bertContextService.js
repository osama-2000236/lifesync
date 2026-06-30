const { Op } = require('sequelize');
const ChatLog = require('../../models/ChatLog');
const HealthLog = require('../../models/HealthLog');
const FinancialLog = require('../../models/FinancialLog');
const User = require('../../models/User');
const UserGoal = require('../../models/UserGoal');
const { buildMemoryContext } = require('./memoryService');

const numeric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const plain = (row) => (row?.get ? row.get({ plain: true }) : row);

const clampInt = (raw, fallback, min, max) => {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

// Configurable, switchable context window. Env sets the standard window; a
// per-request `window: 'deep'|'max'` scales history + data up (clamped) so the
// assistant can reason over a longer span when the user asks for depth. Larger
// defaults than before (20 messages / 120 rows) make every model smarter.
const resolveWindow = (option) => {
  const base = {
    days: clampInt(process.env.CONTEXT_WINDOW_DAYS, 30, 1, 365),
    messages: clampInt(process.env.CONTEXT_MESSAGES, 20, 4, 80),
    entries: clampInt(process.env.CONTEXT_MAX_ENTRIES, 120, 20, 500),
    recent: clampInt(process.env.CONTEXT_RECENT_ENTRIES, 16, 6, 60),
  };
  if (option === 'deep' || option === 'max') {
    const scale = option === 'max' ? { d: 6, m: 2, e: 3, r: 2 } : { d: 3, m: 2, e: 3, r: 2 };
    return {
      days: Math.min(365, base.days * scale.d),
      messages: Math.min(80, base.messages * scale.m),
      entries: Math.min(500, base.entries * scale.e),
      recent: Math.min(60, base.recent * scale.r),
      mode: option,
    };
  }
  return { ...base, mode: 'standard' };
};

const summarizeHealth = (rows) => {
  const metrics = {};
  for (const rawRow of rows.map(plain)) {
    const type = rawRow?.type;
    const value = numeric(rawRow?.value);
    if (!type || value === null) continue;
    if (!metrics[type]) metrics[type] = { count: 0, total: 0, latest: value, unit: rawRow.unit || null };
    metrics[type].count += 1;
    metrics[type].total += value;
  }
  for (const metric of Object.values(metrics)) {
    metric.average = round(metric.total / metric.count);
    delete metric.total;
  }
  return metrics;
};

const summarizeFinance = (rows) => {
  const currencies = {};
  for (const rawRow of rows.map(plain)) {
    const amount = numeric(rawRow?.amount);
    if (amount === null) continue;
    const currency = rawRow.currency || 'USD';
    if (!currencies[currency]) currencies[currency] = { expense: 0, income: 0, transactions: 0 };
    const type = rawRow.type === 'income' ? 'income' : 'expense';
    currencies[currency][type] += amount;
    currencies[currency].transactions += 1;
  }
  for (const summary of Object.values(currencies)) {
    summary.expense = round(summary.expense);
    summary.income = round(summary.income);
    summary.net = round(summary.income - summary.expense);
  }
  return currencies;
};

const emptyContext = () => ({
  window_days: clampInt(process.env.CONTEXT_WINDOW_DAYS, 30, 1, 365),
  profile: null,
  active_goals: [],
  recent_messages: [],
  recent_health_entries: [],
  recent_finance_entries: [],
  health: {},
  finance: {},
  memory: { items: [], summary: '', count: 0 },
  conversation: [],
  source_counts: { messages: 0, health_logs: 0, finance_logs: 0, goals: 0 },
});

const buildBertContext = async (
  userId,
  sessionId,
  { excludeChatId = null, excludeChatIds = [], window: windowOption = null } = {}
) => {
  const win = resolveWindow(windowOption);
  const since = new Date(Date.now() - (win.days * 24 * 60 * 60 * 1000));
  const chatWhere = { user_id: userId, session_id: sessionId };
  const excludedIds = [...new Set([excludeChatId, ...excludeChatIds].filter(Boolean))];
  if (excludedIds.length) chatWhere.id = { [Op.notIn]: excludedIds };

  try {
    const [user, goals, chatRows, healthRows, financeRows, memory] = await Promise.all([
      User.findByPk(userId, {
        attributes: ['id', 'name', 'username', 'created_at'],
      }),
      UserGoal.findAll({
        where: { user_id: userId, status: 'active' },
        order: [['created_at', 'DESC']],
        limit: 12,
        attributes: [
          'domain', 'metric_type', 'target_value', 'current_value',
          'unit', 'period', 'start_date', 'end_date', 'status',
        ],
      }),
      ChatLog.findAll({
        where: chatWhere,
        order: [['created_at', 'DESC']],
        limit: win.messages,
        attributes: ['id', 'role', 'message', 'intent', 'created_at'],
      }),
      HealthLog.findAll({
        where: { user_id: userId, logged_at: { [Op.gte]: since } },
        order: [['logged_at', 'DESC']],
        limit: win.entries,
        attributes: ['type', 'value', 'value_text', 'unit', 'duration', 'notes', 'logged_at'],
      }),
      FinancialLog.findAll({
        where: { user_id: userId, logged_at: { [Op.gte]: since } },
        order: [['logged_at', 'DESC']],
        limit: win.entries,
        attributes: ['type', 'amount', 'currency', 'description', 'logged_at'],
      }),
      buildMemoryContext(userId),
    ]);

    const userPlain = plain(user);
    const healthPlain = healthRows.map(plain);
    const financePlain = financeRows.map(plain);

    return {
      window_days: win.days,
      context_window: { mode: win.mode, days: win.days, messages: win.messages, entries: win.entries },
      profile: userPlain ? {
        name: userPlain.name || userPlain.username || null,
        username: userPlain.username || null,
        member_since: userPlain.created_at || null,
      } : null,
      active_goals: goals.map(plain).map((goal) => ({
        domain: goal.domain,
        metric: goal.metric_type,
        target: numeric(goal.target_value),
        current: numeric(goal.current_value),
        unit: goal.unit || null,
        period: goal.period,
        end_date: goal.end_date || null,
      })),
      recent_messages: chatRows.map(plain).reverse().map((row) => ({
        role: row.role,
        message: String(row.message || '').slice(0, 500),
        intent: row.intent || null,
      })),
      // Proper multi-turn conversation (oldest→newest) for real chat models.
      conversation: chatRows.map(plain).reverse()
        .filter((row) => row.message && String(row.message).trim())
        .map((row) => ({
          role: row.role === 'assistant' ? 'assistant' : 'user',
          content: String(row.message).slice(0, 2000),
        })),
      recent_health_entries: healthPlain.slice(0, win.recent).map((row) => ({
        type: row.type,
        value: numeric(row.value),
        value_text: row.value_text ? String(row.value_text).slice(0, 160) : null,
        unit: row.unit || null,
        duration_minutes: numeric(row.duration),
        notes: row.notes ? String(row.notes).slice(0, 160) : null,
        logged_at: row.logged_at,
      })),
      recent_finance_entries: financePlain.slice(0, win.recent).map((row) => ({
        type: row.type,
        amount: numeric(row.amount),
        currency: row.currency || 'USD',
        description: row.description ? String(row.description).slice(0, 160) : null,
        logged_at: row.logged_at,
      })),
      health: summarizeHealth(healthPlain),
      finance: summarizeFinance(financePlain),
      memory: memory || { items: [], summary: '', count: 0 },
      source_counts: {
        messages: chatRows.length,
        health_logs: healthRows.length,
        finance_logs: financeRows.length,
        goals: goals.length,
      },
    };
  } catch (error) {
    return { ...emptyContext(), error: error.message };
  }
};

module.exports = {
  buildBertContext,
  buildAssistantContext: buildBertContext,
  _summarizeHealth: summarizeHealth,
  _summarizeFinance: summarizeFinance,
  _resolveWindow: resolveWindow,
};
