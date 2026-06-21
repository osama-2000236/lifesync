// server/services/ai/insightsService.js
// ============================================
// Insights Service
// Dashboard insights = statistical engine (correlations, scores) + BERT
// (sentiment over the user's own words, natural-language narrative).
//   • insightEngine.js  → numeric backbone (tested, reliable)
//   • BERT /nlp/insights → mood/spending sentiment + headline
// BERT failure degrades gracefully to the statistical summary.
// ============================================

const { Op, fn, col } = require('sequelize');
const { sequelize } = require('../../config/database');
const HealthLog = require('../../models/HealthLog');
const FinancialLog = require('../../models/FinancialLog');
const AISummary = require('../../models/AISummary');
const Category = require('../../models/Category');
const ChatLog = require('../../models/ChatLog');
const { runInsightEngine } = require('./insightEngine');
const { callBertInsights } = require('./providerClient');
const { createNotification } = require('../notificationService');

const DEFAULT_INSIGHT_CACHE_MINUTES = 5;

const getInsightCacheMinutes = () => {
  const parsed = parseInt(process.env.INSIGHT_CACHE_MINUTES || `${DEFAULT_INSIGHT_CACHE_MINUTES}`, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_INSIGHT_CACHE_MINUTES;
};

const parseJsonField = (value, fallback) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
};

const serializeStoredInsight = (summary) => {
  const snapshot = parseJsonField(summary?.metrics_snapshot, {});
  const patterns = parseJsonField(summary?.patterns, []);
  const recommendations = parseJsonField(summary?.recommendations, []);

  return {
    id: summary.id,
    summary: summary.summary,
    headline: snapshot.headline || null,
    patterns: Array.isArray(patterns) ? patterns : [],
    recommendations: Array.isArray(recommendations) ? recommendations : [],
    cross_domain_insights: snapshot.cross_domain || null,
    mood_trend: snapshot.mood_trend || 'insufficient_data',
    spending_trend: snapshot.spending_trend || 'insufficient_data',
    mood_sentiment: snapshot.mood_sentiment || null,
    spending_behavior: snapshot.spending_behavior || null,
    health_score: snapshot.health_score ?? null,
    financial_health_score: snapshot.financial_health_score ?? null,
    budget_summary: snapshot.budget || null,
    model_used: snapshot.model_used || 'statistical',
    generated_at: summary.generated_at,
    period: {
      start: summary.period_start,
      end: summary.period_end,
    },
  };
};

/**
 * Gather the structured inputs the BERT insights endpoint expects:
 * weekly health/finance aggregates, the previous week's expense total
 * (for trend), and recent free-text notes (for BERT sentiment).
 */
const collectBertInsightInputs = async (userId) => {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const health = await HealthLog.findAll({
    where: { user_id: userId, logged_at: { [Op.gte]: weekAgo } },
    attributes: [
      'type',
      [fn('AVG', col('value')), 'avg_value'],
      [fn('SUM', col('value')), 'total_value'],
      [fn('COUNT', col('id')), 'entry_count'],
    ],
    group: ['type'],
    raw: true,
  });

  const finance = await FinancialLog.findAll({
    where: { user_id: userId, logged_at: { [Op.gte]: weekAgo } },
    include: [{ model: Category, as: 'category', attributes: ['name'] }],
    attributes: [
      'type',
      'category_id',
      [fn('SUM', col('amount')), 'total'],
      [fn('COUNT', col('financial_logs.id')), 'count'],
    ],
    group: ['type', 'category_id', 'category.id'],
    raw: true,
    nest: true,
  });

  const prevExpense = await FinancialLog.sum('amount', {
    where: { user_id: userId, type: 'expense', logged_at: { [Op.gte]: twoWeeksAgo, [Op.lt]: weekAgo } },
  });

  // Recent free text the user actually wrote — this is what BERT reads for tone.
  const chatRows = await ChatLog.findAll({
    where: { user_id: userId, role: 'user', created_at: { [Op.gte]: weekAgo } },
    order: [['created_at', 'DESC']],
    limit: 12,
    attributes: ['message'],
    raw: true,
  });
  const notes = chatRows.map((r) => r.message).filter((m) => typeof m === 'string' && m.trim()).slice(0, 12);

  return {
    health,
    finance,
    prev: { expense_total: Number(prevExpense) || 0 },
    notes,
  };
};

/** Merge unique recommendations (statistical first, then BERT's), capped. */
const mergeRecommendations = (statRecs = [], bertRecs = []) => {
  const seen = new Set();
  const out = [];
  for (const rec of [...statRecs, ...bertRecs]) {
    if (!rec || !rec.text) continue;
    const key = rec.text.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rec);
  }
  return out.slice(0, 6);
};

/**
 * Generate and store weekly insights for a user.
 * @param {number} userId
 * @returns {Object} The generated insight payload
 */
const generateAndStoreInsights = async (userId) => {
  // 1) Statistical backbone — correlations, scores, budget (always available).
  const stat = await runInsightEngine(userId);

  // 2) BERT enrichment — sentiment over the user's words + narrative.
  let bert = null;
  try {
    const inputs = await collectBertInsightInputs(userId);
    bert = await callBertInsights(inputs);
  } catch (err) {
    console.warn('BERT insight enrichment unavailable:', err.message);
  }

  const merged = {
    summary: bert?.summary || stat.summary,
    headline: bert?.headline || null,
    patterns: stat.patterns || [],
    recommendations: mergeRecommendations(stat.recommendations, bert?.recommendations),
    cross_domain_insights: stat.cross_domain_insights || bert?.cross_domain_insights || null,
    mood_trend: stat.mood_trend,
    spending_trend: stat.spending_trend,
    mood_sentiment: bert?.mood_sentiment || null,
    spending_behavior: bert?.spending_behavior || null,
    health_score: stat.health_score ?? null,
    financial_health_score: stat.financial_health_score ?? null,
    budget_summary: stat.budget_summary || null,
    model_used: bert?.model_used || 'statistical',
    period: stat.period,
  };

  const generatedAt = new Date();
  const summary = await AISummary.create({
    user_id: userId,
    type: 'combined',
    period_start: new Date(stat.period.start).toISOString().split('T')[0],
    period_end: new Date(stat.period.end).toISOString().split('T')[0],
    summary: merged.summary,
    patterns: merged.patterns,
    recommendations: merged.recommendations,
    metrics_snapshot: {
      health_score: merged.health_score,
      financial_health_score: merged.financial_health_score,
      mood_trend: merged.mood_trend,
      spending_trend: merged.spending_trend,
      mood_sentiment: merged.mood_sentiment,
      spending_behavior: merged.spending_behavior,
      cross_domain: merged.cross_domain_insights,
      headline: merged.headline,
      budget: merged.budget_summary,
      model_used: merged.model_used,
    },
    is_read: false,
    generated_at: generatedAt,
  });

  // UR9.2 — notify the user that fresh insights are ready.
  await createNotification({
    userId,
    type: 'insight',
    title: 'New weekly insights ready',
    message: merged.headline || merged.summary?.slice(0, 140) || 'Your latest LifeSync insights are ready to view.',
    link: '/dashboard',
    metadata: {
      summary_id: summary.id,
      health_score: merged.health_score,
      financial_health_score: merged.financial_health_score,
      model_used: merged.model_used,
    },
  });

  return serializeStoredInsight(summary);
};

const getCurrentInsights = async (userId) => {
  const latest = await AISummary.findOne({
    where: { user_id: userId },
    order: [['generated_at', 'DESC']],
  });
  const cacheMinutes = getInsightCacheMinutes();
  const cacheMs = cacheMinutes * 60 * 1000;

  if (latest && cacheMs > 0) {
    const ageMs = Date.now() - new Date(latest.generated_at).getTime();
    if (ageMs < cacheMs) {
      return serializeStoredInsight(latest);
    }
  }

  try {
    return await generateAndStoreInsights(userId);
  } catch (error) {
    if (latest) {
      return {
        ...serializeStoredInsight(latest),
        stale: true,
      };
    }
    throw error;
  }
};

/**
 * Get the latest insights for a user
 */
const getLatestInsights = async (userId, limit = 5) => {
  return AISummary.findAll({
    where: { user_id: userId },
    order: [['generated_at', 'DESC']],
    limit,
  });
};

/**
 * Mark an insight as read
 */
const markAsRead = async (insightId, userId) => {
  const insight = await AISummary.findOne({
    where: { id: insightId, user_id: userId },
  });

  if (!insight) return null;

  await insight.update({ is_read: true });
  return insight;
};

module.exports = {
  generateAndStoreInsights,
  getCurrentInsights,
  getLatestInsights,
  markAsRead,
  _collectBertInsightInputs: collectBertInsightInputs,
  _serializeStoredInsight: serializeStoredInsight,
  _mergeRecommendations: mergeRecommendations,
};
