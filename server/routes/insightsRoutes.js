// server/routes/insightsRoutes.js
// ============================================
// Insight Engine Routes
// GET  /api/insights         → Run engine + return insights
// GET  /api/insights/history → Stored past insights
// POST /api/insights/generate → Force regeneration
// PUT  /api/insights/:id/read → Mark as read
// ============================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  buildDashboardInsights,
  persistDashboardInsights,
} = require('../services/ai/dashboardInsightsService');
const { getLatestInsights, markAsRead } = require('../services/ai/insightsService');
const { buildGamification } = require('../services/ai/gamificationService');
const { buildHorizon } = require('../services/ai/longHorizon');
const HealthLog = require('../models/HealthLog');
const FinancialLog = require('../models/FinancialLog');
const { success, error, created } = require('../utils/responseHelper');

// Get current insights (Gemma-backed, with short cache for dashboard refreshes)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const insights = await buildDashboardInsights(req.user.id);
    success(res, { insights }, 'Insights generated');
  } catch (err) {
    next(err);
  }
});

// Get stored insight history
router.get('/history', authenticate, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const insights = await getLatestInsights(req.user.id, limit);
    success(res, { insights }, 'Insight history');
  } catch (err) {
    next(err);
  }
});

// Force generate + persist
router.post('/generate', authenticate, async (req, res, next) => {
  try {
    const insights = await persistDashboardInsights(req.user.id);
    created(res, { insights }, 'Insights generated and stored');
  } catch (err) {
    next(err);
  }
});

// Gamification: streak, lifetime stats, and unlocked achievements (bilingual).
router.get('/gamification', authenticate, async (req, res, next) => {
  try {
    const [healthRows, financeRows] = await Promise.all([
      // type + value so buildHorizon can compute week sleep/mood averages.
      HealthLog.findAll({ where: { user_id: req.user.id }, attributes: ['logged_at', 'type', 'value'], order: [['logged_at', 'DESC']], limit: 1000 }),
      FinancialLog.findAll({ where: { user_id: req.user.id }, attributes: ['logged_at', 'type', 'amount'], order: [['logged_at', 'DESC']], limit: 1000 }),
    ]);
    const health = healthRows.map((r) => (r.get ? r.get({ plain: true }) : r));
    const finance = financeRows.map((r) => (r.get ? r.get({ plain: true }) : r));
    const data = buildGamification(health, finance);
    // Second-mind snapshot for the dashboard card: same rows, same refresh
    // cycle as the streak — pure math, no extra query, no model call.
    data.horizon = buildHorizon(health, finance);
    success(res, data, 'Gamification snapshot');
  } catch (err) {
    next(err);
  }
});

// Mark insight as read
router.put('/:id/read', authenticate, async (req, res, next) => {
  try {
    const insight = await markAsRead(req.params.id, req.user.id);
    if (!insight) return error(res, 'Insight not found', 404);
    success(res, { insight }, 'Insight marked as read');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
