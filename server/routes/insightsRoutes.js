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
const { runInsightEngine, generateAndPersistInsights } = require('../services/ai/insightEngine');
const { getLatestInsights, markAsRead } = require('../services/ai/insightsService');
const { success, error, created } = require('../utils/responseHelper');

// Get current insights (runs engine in real-time)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const insights = await runInsightEngine(req.user.id);
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
    const insights = await generateAndPersistInsights(req.user.id);
    created(res, { insights }, 'Insights generated and stored');
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
