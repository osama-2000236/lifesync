// server/services/ai/insightsService.js
// ============================================
// Insights Service
// Gathers weekly data and generates model-backed summaries
// ============================================

const { Op } = require('sequelize');
const { sequelize } = require('../../config/database');
const HealthLog = require('../../models/HealthLog');
const FinancialLog = require('../../models/FinancialLog');
const AISummary = require('../../models/AISummary');
const Category = require('../../models/Category');
const { generateWeeklyInsights } = require('./nlpService');

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
    patterns: Array.isArray(patterns) ? patterns : [],
    recommendations: Array.isArray(recommendations) ? recommendations : [],
    cross_domain_insights: snapshot.cross_domain || null,
    mood_trend: snapshot.mood_trend || 'insufficient_data',
    spending_trend: snapshot.spending_trend || 'insufficient_data',
    health_score: snapshot.health_score ?? null,
    financial_health_score: snapshot.financial_health_score ?? null,
    generated_at: summary.generated_at,
    period: {
      start: summary.period_start,
      end: summary.period_end,
    },
  };
};

const collectWeeklyInsightInputs = async (userId) => {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const healthData = await HealthLog.findAll({
    where: {
      user_id: userId,
      logged_at: { [Op.gte]: weekAgo },
    },
    attributes: [
      'type',
      [sequelize.fn('AVG', sequelize.col('value')), 'avg_value'],
      [sequelize.fn('SUM', sequelize.col('value')), 'total_value'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'entry_count'],
    ],
    group: ['type'],
    raw: true,
  });

  // Gather finance data
  const financeData = await FinancialLog.findAll({
    where: {
      user_id: userId,
      logged_at: { [Op.gte]: weekAgo },
    },
    include: [
      { model: Category, as: 'category', attributes: ['name'] },
    ],
    attributes: [
      'type',
      'category_id',
      [sequelize.fn('SUM', sequelize.col('amount')), 'total'],
      [sequelize.fn('COUNT', sequelize.col('financial_logs.id')), 'count'],
    ],
    group: ['type', 'category_id', 'category.id'],
    raw: true,
    nest: true,
  });

  return { now, weekAgo, healthData, financeData };
};

/**
 * Generate and store weekly insights for a user
 * @param {number} userId - The user ID to generate insights for
 * @returns {Object} The generated insight payload
 */
const generateAndStoreInsights = async (userId) => {
  const { now, weekAgo, healthData, financeData } = await collectWeeklyInsightInputs(userId);

  // Call the configured AI provider to analyze
  const insights = await generateWeeklyInsights(
    { metrics: healthData, period: { start: weekAgo, end: now } },
    { transactions: financeData, period: { start: weekAgo, end: now } }
  );
  const generatedAt = new Date();

  // Store the insight
  const summary = await AISummary.create({
    user_id: userId,
    type: 'combined',
    period_start: weekAgo.toISOString().split('T')[0],
    period_end: now.toISOString().split('T')[0],
    summary: insights.summary,
    patterns: insights.patterns || [],
    recommendations: insights.recommendations || [],
    metrics_snapshot: {
      health: healthData,
      finance: financeData,
      health_score: insights.health_score ?? null,
      financial_health_score: insights.financial_health_score ?? null,
      mood_trend: insights.mood_trend,
      spending_trend: insights.spending_trend,
      cross_domain: insights.cross_domain_insights,
    },
    is_read: false,
    generated_at: generatedAt,
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
 * @param {number} userId
 * @param {number} limit - Number of recent insights to return
 */
const getLatestInsights = async (userId, limit = 5) => {
  const safeLimit = Math.min(20, Math.max(1, parseInt(limit, 10) || 5));
  const rows = await AISummary.findAll({
    where: { user_id: userId },
    order: [['generated_at', 'DESC']],
    limit: safeLimit,
  });
  // Never return raw Sequelize rows (metrics_snapshot may hold bulky internals).
  return rows.map(serializeStoredInsight);
};

/**
 * Mark an insight as read
 */
const markAsRead = async (insightId, userId) => {
  const id = parseInt(insightId, 10);
  if (!Number.isFinite(id) || id < 1) return null;

  const insight = await AISummary.findOne({
    where: { id, user_id: userId },
  });

  if (!insight) return null;

  await insight.update({ is_read: true });
  return serializeStoredInsight(insight);
};

module.exports = { generateAndStoreInsights, getCurrentInsights, getLatestInsights, markAsRead };
