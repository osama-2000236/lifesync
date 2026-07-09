const { Op } = require('sequelize');
// Load registry so LinkedDomain ↔ Health/Finance associations exist.
const {
  ChatLog, HealthLog, FinancialLog, User, UserGoal, LinkedDomain, Category,
} = require('../../models');
const { buildMemoryContext } = require('./memoryService');
const { buildHorizon } = require('./longHorizon');

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
// per-request `window: 'deep'|'max'` scales history + data up (clamped).
// MAX is the full user harness: widest days, deepest chat, densest logs + XD links.
const resolveWindow = (option) => {
  const base = {
    days: clampInt(process.env.CONTEXT_WINDOW_DAYS, 90, 1, 365),
    messages: clampInt(process.env.CONTEXT_MESSAGES, 40, 4, 120),
    entries: clampInt(process.env.CONTEXT_MAX_ENTRIES, 200, 20, 800),
    recent: clampInt(process.env.CONTEXT_RECENT_ENTRIES, 24, 6, 80),
    links: 4,
  };
  if (option === 'max') {
    return {
      days: 365,
      messages: Math.min(120, Math.max(base.messages * 3, 80)),
      entries: Math.min(800, Math.max(base.entries * 4, 500)),
      recent: Math.min(80, Math.max(base.recent * 3, 48)),
      links: 16,
      memory: 20,
      mode: 'max',
    };
  }
  if (option === 'deep') {
    return {
      days: Math.min(365, base.days * 3),
      messages: Math.min(100, base.messages * 2),
      entries: Math.min(600, base.entries * 3),
      recent: Math.min(60, base.recent * 2),
      links: 8,
      memory: 16,
      mode: 'deep',
    };
  }
  return { ...base, memory: 12, mode: 'standard' };
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

/** Finance summary at health parity: totals + counts + avg + top spend labels. */
const summarizeFinance = (rows) => {
  const currencies = {};
  for (const rawRow of rows.map(plain)) {
    const amount = numeric(rawRow?.amount);
    if (amount === null) continue;
    const currency = rawRow.currency || 'USD';
    if (!currencies[currency]) {
      currencies[currency] = {
        expense: 0, income: 0, transactions: 0,
        expense_count: 0, income_count: 0, _cats: {},
      };
    }
    const type = rawRow.type === 'income' ? 'income' : 'expense';
    currencies[currency][type] += amount;
    currencies[currency].transactions += 1;
    if (type === 'expense') {
      currencies[currency].expense_count += 1;
      const label = String(
        rawRow.description || rawRow.category?.name || rawRow.category_name || 'other',
      ).trim().toLowerCase().slice(0, 40) || 'other';
      currencies[currency]._cats[label] = (currencies[currency]._cats[label] || 0) + amount;
    } else {
      currencies[currency].income_count += 1;
    }
  }
  for (const summary of Object.values(currencies)) {
    summary.expense = round(summary.expense);
    summary.income = round(summary.income);
    summary.net = round(summary.income - summary.expense);
    summary.avg_expense = summary.expense_count
      ? round(summary.expense / summary.expense_count)
      : 0;
    summary.top_categories = Object.entries(summary._cats || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, total]) => ({ name, total: round(total) }));
    delete summary._cats;
  }
  return currencies;
};

const emptyContext = () => ({
  window_days: clampInt(process.env.CONTEXT_WINDOW_DAYS, 90, 1, 365),
  context_window: { mode: 'standard', days: 90, messages: 40, entries: 200, links: 4 },
  profile: null,
  active_goals: [],
  recent_messages: [],
  recent_health_entries: [],
  recent_finance_entries: [],
  linked_domains: [],
  health: {},
  finance: {},
  horizon: null,
  memory: { items: [], summary: '', count: 0 },
  conversation: [],
  source_counts: { messages: 0, health_logs: 0, finance_logs: 0, goals: 0, linked_domains: 0 },
});

/** Compact XD pairs for Track B (bounded). */
const mapLinkedDomains = (rows) => (rows || []).map((row) => {
  const p = plain(row);
  const h = plain(p.healthLog || p.health_log);
  const f = plain(p.financialLog || p.financial_log);
  return {
    health: h ? {
      type: h.type,
      value: numeric(h.value),
      value_text: h.value_text ? String(h.value_text).slice(0, 80) : null,
      unit: h.unit || null,
    } : null,
    finance: f ? {
      type: f.type,
      amount: numeric(f.amount),
      currency: f.currency || 'USD',
      description: f.description ? String(f.description).slice(0, 80) : null,
    } : null,
    source: p.source_message ? String(p.source_message).slice(0, 160) : null,
    link_type: p.link_type || 'auto_nlp',
  };
}).filter((l) => l.health || l.finance);

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
    // All independent — one round-trip wave (perf).
    const [user, goals, chatRows, healthRows, financeRows, memory, linkedRows] = await Promise.all([
      User.findByPk(userId, {
        attributes: ['id', 'name', 'username', 'created_at'],
      }),
      UserGoal.findAll({
        where: { user_id: userId, status: 'active' },
        order: [['created_at', 'DESC']],
        limit: win.mode === 'max' ? 20 : 12,
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
        include: [{ model: Category, as: 'category', attributes: ['name'], required: false }],
      }),
      buildMemoryContext(userId, { limit: win.memory || 12 }),
      // True XD harness: real LinkedDomain rows (meal↔spend, sleep↔cost, …).
      LinkedDomain.findAll({
        include: [
          {
            model: HealthLog,
            as: 'healthLog',
            required: true,
            where: { user_id: userId },
            attributes: ['id', 'type', 'value', 'value_text', 'unit', 'logged_at'],
          },
          {
            model: FinancialLog,
            as: 'financialLog',
            required: true,
            attributes: ['id', 'type', 'amount', 'currency', 'description', 'logged_at'],
          },
        ],
        order: [['id', 'DESC']],
        limit: win.links || 4,
      }).catch(() => []), // table/assoc missing must not break chat
    ]);

    const userPlain = plain(user);
    const healthPlain = healthRows.map(plain);
    const financePlain = financeRows.map(plain);
    const linked_domains = mapLinkedDomains(linkedRows);
    const profile = userPlain ? {
      name: userPlain.name || userPlain.username || null,
      username: userPlain.username || null,
      member_since: userPlain.created_at || null,
    } : null;
    // Years-with-user awareness from rows already loaded (week/month trends, streak).
    const horizon = buildHorizon(healthPlain, financePlain, profile || {});

    return {
      window_days: win.days,
      context_window: {
        mode: win.mode,
        days: win.days,
        messages: win.messages,
        entries: win.entries,
        recent: win.recent,
        links: win.links,
      },
      profile,
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
        description: row.description
          ? String(row.description).slice(0, 160)
          : (row.category?.name ? String(row.category.name).slice(0, 160) : null),
        category: row.category?.name || null,
        logged_at: row.logged_at,
      })),
      linked_domains,
      health: summarizeHealth(healthPlain),
      finance: summarizeFinance(financePlain),
      horizon,
      memory: memory || { items: [], summary: '', count: 0 },
      source_counts: {
        messages: chatRows.length,
        health_logs: healthRows.length,
        finance_logs: financeRows.length,
        goals: goals.length,
        linked_domains: linked_domains.length,
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
  _mapLinkedDomains: mapLinkedDomains,
};
