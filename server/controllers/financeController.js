// server/controllers/financeController.js
// ============================================
// Financial Log Controller
// CRUD operations for income and expense tracking
// ============================================

const { Op } = require('sequelize');
const { body } = require('express-validator');
const FinancialLog = require('../models/FinancialLog');
const Category = require('../models/Category');
const LinkedDomain = require('../models/LinkedDomain');
const { success, created, paginated, error } = require('../utils/responseHelper');

// ============================================
// VALIDATION RULES
// ============================================

const createFinanceLogValidation = [
  body('type')
    .isIn(['income', 'expense'])
    .withMessage('Type must be either income or expense.'),
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be a positive number.'),
  body('currency')
    .optional()
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency must be a 3-letter ISO code.'),
  body('description')
    .optional()
    .trim(),
  body('logged_at')
    .optional()
    .isISO8601()
    .withMessage('logged_at must be a valid ISO 8601 date.'),
  body('source')
    .optional()
    .isIn(['manual', 'nlp', 'api']),
  body('category_id')
    .optional()
    .isInt(),
];

// ============================================
// CONTROLLER METHODS
// ============================================

/**
 * POST /api/finance
 * Create a new financial log entry
 */
const createFinanceLog = async (req, res, next) => {
  try {
    const { type, amount, currency, description, logged_at, source, category_id } = req.body;

    const entry = await FinancialLog.create({
      user_id: req.user.id,
      type,
      amount,
      currency: currency || 'USD',
      description: description || null,
      logged_at: logged_at || new Date(),
      source: source || 'manual',
      category_id: category_id || null,
    });

    return created(res, { entry }, 'Financial entry logged successfully.');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/finance
 * List financial logs with filtering, searching, and pagination
 */
const getFinanceLogs = async (req, res, next) => {
  try {
    const {
      type,
      category_id,
      start_date,
      end_date,
      min_amount,
      max_amount,
      search,
      page = 1,
      limit = 20,
      sort_by = 'logged_at',
      sort_order = 'DESC',
    } = req.query;

    const where = { user_id: req.user.id };

    if (type) where.type = type;
    if (category_id) where.category_id = category_id;

    if (start_date || end_date) {
      where.logged_at = {};
      if (start_date) where.logged_at[Op.gte] = new Date(start_date);
      if (end_date) where.logged_at[Op.lte] = new Date(end_date);
    }

    if (min_amount || max_amount) {
      where.amount = {};
      if (min_amount) where.amount[Op.gte] = parseFloat(min_amount);
      if (max_amount) where.amount[Op.lte] = parseFloat(max_amount);
    }

    if (search) {
      where.description = { [Op.like]: `%${search}%` };
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await FinancialLog.findAndCountAll({
      where,
      include: [
        { model: Category, as: 'category', attributes: ['id', 'name', 'icon', 'color'] },
      ],
      order: [[sort_by, sort_order.toUpperCase()]],
      limit: parseInt(limit),
      offset,
    });

    return paginated(res, rows, {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      totalPages: Math.ceil(count / parseInt(limit)),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/finance/:id
 * Get a single financial log entry
 */
const getFinanceLogById = async (req, res, next) => {
  try {
    const entry = await FinancialLog.findOne({
      where: { id: req.params.id, user_id: req.user.id },
      include: [
        { model: Category, as: 'category', attributes: ['id', 'name', 'icon', 'color'] },
        {
          model: LinkedDomain,
          as: 'linkedEntries',
          attributes: ['id', 'health_log_id', 'source_message', 'confidence'],
        },
      ],
    });

    if (!entry) {
      return error(res, 'Financial log entry not found.', 404);
    }

    return success(res, { entry });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/finance/:id
 * Update a financial log entry
 */
const updateFinanceLog = async (req, res, next) => {
  try {
    const entry = await FinancialLog.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });

    if (!entry) {
      return error(res, 'Financial log entry not found.', 404);
    }

    const allowedFields = ['type', 'amount', 'currency', 'description', 'logged_at', 'category_id'];
    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    await entry.update(updates);

    return success(res, { entry }, 'Financial entry updated.');
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/finance/:id
 * Delete a financial log entry
 */
const deleteFinanceLog = async (req, res, next) => {
  try {
    const entry = await FinancialLog.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });

    if (!entry) {
      return error(res, 'Financial log entry not found.', 404);
    }

    await entry.destroy();

    return success(res, null, 'Financial entry deleted.');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/finance/summary/weekly
 * Get weekly financial summary by category and type
 */
const getWeeklySummary = async (req, res, next) => {
  try {
    const { sequelize } = require('../config/database');

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Totals by type
    const totals = await FinancialLog.findAll({
      where: {
        user_id: req.user.id,
        logged_at: { [Op.gte]: weekAgo },
      },
      attributes: [
        'type',
        [sequelize.fn('SUM', sequelize.col('amount')), 'total'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('AVG', sequelize.col('amount')), 'average'],
      ],
      group: ['type'],
      raw: true,
    });

    // Breakdown by category (expenses only)
    const categoryBreakdown = await FinancialLog.findAll({
      where: {
        user_id: req.user.id,
        type: 'expense',
        logged_at: { [Op.gte]: weekAgo },
      },
      attributes: [
        'category_id',
        [sequelize.fn('SUM', sequelize.col('amount')), 'total'],
        [sequelize.fn('COUNT', sequelize.col('financial_logs.id')), 'count'],
      ],
      include: [
        { model: Category, as: 'category', attributes: ['name', 'icon', 'color'] },
      ],
      group: ['category_id', 'category.id'],
      raw: true,
      nest: true,
    });

    return success(res, {
      period: { start: weekAgo, end: now },
      totals,
      categoryBreakdown,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createFinanceLog,
  getFinanceLogs,
  getFinanceLogById,
  updateFinanceLog,
  deleteFinanceLog,
  getWeeklySummary,
  createFinanceLogValidation,
};
