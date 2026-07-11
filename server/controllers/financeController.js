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
const { sanitizeListQuery } = require('../utils/listQuery');

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
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description must be at most 2000 characters.'),
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
  body('user_id')
    .not()
    .exists()
    .withMessage('user_id cannot be set by the client.'),
];

/** Max rows scanned for in-memory search over AES description (per-user). */
const ENCRYPTED_SEARCH_CAP = 500;

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
    } = req.query;
    const { page, limit, sort_by, sort_order, offset } = sanitizeListQuery(req.query, {
      allowedSort: ['logged_at', 'created_at', 'id', 'amount', 'type'],
    });

    const where = { user_id: req.user.id };

    if (type === 'income' || type === 'expense') where.type = type;
    if (category_id) where.category_id = parseInt(category_id, 10);

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

    const include = [
      { model: Category, as: 'category', attributes: ['id', 'name', 'icon', 'color'] },
    ];

    // description is AES-encrypted — SQL LIKE cannot match plaintext queries.
    if (search) {
      const q = String(search).slice(0, 200).toLowerCase();
      const candidates = await FinancialLog.findAll({
        where,
        include,
        order: [[sort_by, sort_order]],
        limit: ENCRYPTED_SEARCH_CAP,
      });
      const matched = candidates.filter((row) => (
        String(row.description || '').toLowerCase().includes(q)
      ));
      const total = matched.length;
      const rows = matched.slice(offset, offset + limit);
      return paginated(res, rows, {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit) || 1),
      });
    }

    const { count, rows } = await FinancialLog.findAndCountAll({
      where,
      include,
      order: [[sort_by, sort_order]],
      limit,
      offset,
    });

    return paginated(res, rows, {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
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
    if (updates.amount !== undefined) {
      const amt = parseFloat(updates.amount);
      if (!Number.isFinite(amt) || amt < 0.01) {
        return error(res, 'Amount must be a positive number (≥ 0.01).', 400);
      }
      updates.amount = amt;
    }
    if (updates.type !== undefined && !['income', 'expense'].includes(updates.type)) {
      return error(res, 'Type must be either income or expense.', 400);
    }
    if (updates.description !== undefined && String(updates.description).length > 2000) {
      return error(res, 'Description must be at most 2000 characters.', 400);
    }
    delete updates.user_id;

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
