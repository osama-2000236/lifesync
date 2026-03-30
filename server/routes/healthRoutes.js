// server/routes/healthRoutes.js
// ============================================
// Health Log Routes
// ============================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  createHealthLog, getHealthLogs, getHealthLogById,
  updateHealthLog, deleteHealthLog, getWeeklySummary,
  createHealthLogValidation,
} = require('../controllers/healthController');

// All routes require authentication
router.use(authenticate);

// Summary route (must come before :id)
router.get('/summary/weekly', getWeeklySummary);

// CRUD routes
router.post('/', createHealthLogValidation, validate, createHealthLog);
router.get('/', getHealthLogs);
router.get('/:id', getHealthLogById);
router.put('/:id', updateHealthLog);
router.delete('/:id', deleteHealthLog);

module.exports = router;
