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

/**
 * Generate and store weekly insights for a user
 * @param {number} userId - The user ID to generate insights for
 * @returns {Object} The generated AISummary record
 */
const generateAndStoreInsights = async (userId) => {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Gather health data
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

  // Call the configured AI provider to analyze
  const insights = await generateWeeklyInsights(
    { metrics: healthData, period: { start: weekAgo, end: now } },
    { transactions: financeData, period: { start: weekAgo, end: now } }
  );

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
      mood_trend: insights.mood_trend,
      spending_trend: insights.spending_trend,
      cross_domain: insights.cross_domain_insights,
    },
    is_read: false,
    generated_at: now,
  });

  return summary;
};

/**
 * Get the latest insights for a user
 * @param {number} userId
 * @param {number} limit - Number of recent insights to return
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

module.exports = { generateAndStoreInsights, getLatestInsights, markAsRead };
