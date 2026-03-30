// server/routes/financeRoutes.js
// ============================================
// Financial Log Routes
// ============================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  createFinanceLog, getFinanceLogs, getFinanceLogById,
  updateFinanceLog, deleteFinanceLog, getWeeklySummary,
  createFinanceLogValidation,
} = require('../controllers/financeController');

// All routes require authentication
router.use(authenticate);

// Summary route (must come before :id)
router.get('/summary/weekly', getWeeklySummary);

// CRUD routes
router.post('/', createFinanceLogValidation, validate, createFinanceLog);
router.get('/', getFinanceLogs);
router.get('/:id', getFinanceLogById);
router.put('/:id', updateFinanceLog);
router.delete('/:id', deleteFinanceLog);

module.exports = router;
