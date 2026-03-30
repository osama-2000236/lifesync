// server/controllers/healthController.js
// ============================================
// Health Log Controller
// CRUD operations for health entries (steps, sleep, mood, etc.)
// ============================================

const { Op } = require('sequelize');
const { body, query, param } = require('express-validator');
const HealthLog = require('../models/HealthLog');
const Category = require('../models/Category');
const LinkedDomain = require('../models/LinkedDomain');
const { success, created, paginated, error } = require('../utils/responseHelper');

// ============================================
// VALIDATION RULES
// ============================================

const createHealthLogValidation = [
  body('type')
    .isIn(['steps', 'sleep', 'mood', 'nutrition', 'water', 'exercise', 'heart_rate'])
    .withMessage('Type must be one of: steps, sleep, mood, nutrition, water, exercise, heart_rate.'),
  body('value')
    .isNumeric()
    .withMessage('Value must be a number.'),
  body('value_text')
    .optional()
    .trim()
    .isLength({ max: 255 }),
  body('unit')
    .optional()
    .trim()
    .isLength({ max: 20 }),
  body('duration')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Duration must be a positive integer (minutes).'),
  body('notes')
    .optional()
    .trim(),
  body('logged_at')
    .optional()
    .isISO8601()
    .withMessage('logged_at must be a valid ISO 8601 date.'),
  body('source')
    .optional()
    .isIn(['manual', 'nlp', 'google_fit', 'apple_health', 'api']),
  body('category_id')
    .optional()
    .isInt(),
];

// ============================================
// CONTROLLER METHODS
// ============================================

/**
 * POST /api/health
 * Create a new health log entry
 */
const createHealthLog = async (req, res, next) => {
  try {
    const {
      type, value, value_text, unit, duration,
      notes, logged_at, source, category_id,
    } = req.body;

    // Auto-assign unit if not provided
    const unitMap = {
      steps: 'steps',
      sleep: 'hours',
      mood: 'rating',
      nutrition: 'kcal',
      water: 'liters',
      exercise: 'minutes',
      heart_rate: 'bpm',
    };

    const entry = await HealthLog.create({
      user_id: req.user.id,
      type,
      value,
      value_text: value_text || null,
      unit: unit || unitMap[type] || null,
      duration: duration || null,
      notes: notes || null,
      logged_at: logged_at || new Date(),
      source: source || 'manual',
      category_id: category_id || null,
    });

    return created(res, { entry }, 'Health entry logged successfully.');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/health
 * List health logs with filtering, searching, and pagination
 */
const getHealthLogs = async (req, res, next) => {
  try {
    const {
      type,
      start_date,
      end_date,
      source,
      search,
      page = 1,
      limit = 20,
      sort_by = 'logged_at',
      sort_order = 'DESC',
    } = req.query;

    // Build filter conditions
    const where = { user_id: req.user.id };

    if (type) where.type = type;
    if (source) where.source = source;
    if (start_date || end_date) {
      where.logged_at = {};
      if (start_date) where.logged_at[Op.gte] = new Date(start_date);
      if (end_date) where.logged_at[Op.lte] = new Date(end_date);
    }
    if (search) {
      where[Op.or] = [
        { notes: { [Op.like]: `%${search}%` } },
        { value_text: { [Op.like]: `%${search}%` } },
      ];
    }

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await HealthLog.findAndCountAll({
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
 * GET /api/health/:id
 * Get a single health log entry
 */
const getHealthLogById = async (req, res, next) => {
  try {
    const entry = await HealthLog.findOne({
      where: { id: req.params.id, user_id: req.user.id },
      include: [
        { model: Category, as: 'category', attributes: ['id', 'name', 'icon', 'color'] },
        {
          model: LinkedDomain,
          as: 'linkedEntries',
          attributes: ['id', 'financial_log_id', 'source_message', 'confidence'],
        },
      ],
    });

    if (!entry) {
      return error(res, 'Health log entry not found.', 404);
    }

    return success(res, { entry });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/health/:id
 * Update a health log entry
 */
const updateHealthLog = async (req, res, next) => {
  try {
    const entry = await HealthLog.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });

    if (!entry) {
      return error(res, 'Health log entry not found.', 404);
    }

    const allowedFields = ['type', 'value', 'value_text', 'unit', 'duration', 'notes', 'logged_at', 'category_id'];
    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    await entry.update(updates);

    return success(res, { entry }, 'Health entry updated.');
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/health/:id
 * Delete a health log entry
 */
const deleteHealthLog = async (req, res, next) => {
  try {
    const entry = await HealthLog.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });

    if (!entry) {
      return error(res, 'Health log entry not found.', 404);
    }

    await entry.destroy();

    return success(res, null, 'Health entry deleted.');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/health/summary/weekly
 * Get weekly health averages/totals grouped by type
 */
const getWeeklySummary = async (req, res, next) => {
  try {
    const { sequelize } = require('../config/database');

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const summary = await HealthLog.findAll({
      where: {
        user_id: req.user.id,
        logged_at: { [Op.gte]: weekAgo },
      },
      attributes: [
        'type',
        [sequelize.fn('AVG', sequelize.col('value')), 'avg_value'],
        [sequelize.fn('SUM', sequelize.col('value')), 'total_value'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'entry_count'],
        [sequelize.fn('MIN', sequelize.col('value')), 'min_value'],
        [sequelize.fn('MAX', sequelize.col('value')), 'max_value'],
      ],
      group: ['type'],
      raw: true,
    });

    return success(res, {
      period: { start: weekAgo, end: now },
      summary,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createHealthLog,
  getHealthLogs,
  getHealthLogById,
  updateHealthLog,
  deleteHealthLog,
  getWeeklySummary,
  createHealthLogValidation,
};
