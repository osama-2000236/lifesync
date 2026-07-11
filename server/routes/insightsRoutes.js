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
const { insightLimiter } = require('../middleware/rateLimiter');
const {
  buildDashboardInsights,
  persistDashboardInsights,
} = require('../services/ai/dashboardInsightsService');
const { getLatestInsights, markAsRead } = require('../services/ai/insightsService');
const { buildGamification } = require('../services/ai/gamificationService');
const { buildHorizon } = require('../services/ai/longHorizon');
const { getGoalsWithProgress } = require('../services/ai/goalProgress');
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
    // Cap page size — history is for UI carousel, not bulk export.
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 5));
    const insights = await getLatestInsights(req.user.id, limit);
    success(res, { insights }, 'Insight history');
  } catch (err) {
    next(err);
  }
});

// Force generate + persist (expensive — rate-limited separately from reads)
router.post('/generate', authenticate, insightLimiter, async (req, res, next) => {
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
    const [healthRows, financeRows, goals] = await Promise.all([
      // type + value so buildHorizon can compute week sleep/mood averages.
      HealthLog.findAll({ where: { user_id: req.user.id }, attributes: ['logged_at', 'type', 'value'], order: [['logged_at', 'DESC']], limit: 1000 }),
      FinancialLog.findAll({ where: { user_id: req.user.id }, attributes: ['logged_at', 'type', 'amount'], order: [['logged_at', 'DESC']], limit: 1000 }),
      // Goals with live progress — a goals hiccup must not sink the streak card.
      getGoalsWithProgress(req.user.id).catch(() => []),
    ]);
    const health = healthRows.map((r) => (r.get ? r.get({ plain: true }) : r));
    const finance = financeRows.map((r) => (r.get ? r.get({ plain: true }) : r));
    const data = buildGamification(health, finance);
    // Second-mind snapshot for the dashboard card: same rows, same refresh
    // cycle as the streak — pure math, no extra query, no model call.
    data.horizon = buildHorizon(health, finance);
    data.goals = goals;
    success(res, data, 'Gamification snapshot');
  } catch (err) {
    next(err);
  }
});

// Mark insight as read (ownership enforced inside markAsRead)
router.put('/:id/read', authenticate, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id < 1) {
      return error(res, 'Invalid insight id.', 400, 'VALIDATION_ERROR');
    }
    const insight = await markAsRead(id, req.user.id);
    if (!insight) return error(res, 'Insight not found', 404);
    success(res, { insight }, 'Insight marked as read');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
