// server/controllers/adminController.js
// ============================================
// Admin Controller
// System health monitoring, user management, activity tracking
// ============================================

const { Op } = require('sequelize');
const User = require('../models/User');
const HealthLog = require('../models/HealthLog');
const FinancialLog = require('../models/FinancialLog');
const ChatLog = require('../models/ChatLog');
const SystemLog = require('../models/SystemLog');
const { sequelize } = require('../config/database');
const { success, paginated, error } = require('../utils/responseHelper');

/**
 * GET /api/admin/dashboard
 * Get system-wide statistics for admin dashboard
 */
const getDashboard = async (req, res, next) => {
  try {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // User stats
    const totalUsers = await User.count();
    const activeUsers = await User.count({ where: { is_active: true } });
    const newUsersThisWeek = await User.count({
      where: { created_at: { [Op.gte]: weekAgo } },
    });

    // Activity stats (last 24h)
    const healthLogsToday = await HealthLog.count({
      where: { created_at: { [Op.gte]: dayAgo } },
    });
    const financeLogsToday = await FinancialLog.count({
      where: { created_at: { [Op.gte]: dayAgo } },
    });
    const chatMessagesToday = await ChatLog.count({
      where: { created_at: { [Op.gte]: dayAgo }, role: 'user' },
    });

    // System health
    const recentErrors = await SystemLog.count({
      where: {
        severity: { [Op.in]: ['error', 'critical'] },
        created_at: { [Op.gte]: dayAgo },
      },
    });

    // NLP performance (avg processing time)
    const avgNlpTime = await ChatLog.findOne({
      where: {
        role: 'user',
        processing_time_ms: { [Op.not]: null },
        created_at: { [Op.gte]: dayAgo },
      },
      attributes: [
        [sequelize.fn('AVG', sequelize.col('processing_time_ms')), 'avg_ms'],
        [sequelize.fn('MAX', sequelize.col('processing_time_ms')), 'max_ms'],
      ],
      raw: true,
    });

    return success(res, {
      users: { total: totalUsers, active: activeUsers, new_this_week: newUsersThisWeek },
      activity_24h: {
        health_logs: healthLogsToday,
        finance_logs: financeLogsToday,
        chat_messages: chatMessagesToday,
      },
      system: {
        errors_24h: recentErrors,
        nlp_avg_ms: Math.round(avgNlpTime?.avg_ms || 0),
        nlp_max_ms: avgNlpTime?.max_ms || 0,
        status: recentErrors > 10 ? 'degraded' : 'healthy',
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/users
 * List all users with pagination
 */
const getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, role, is_active } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (search) {
      where[Op.or] = [
        { username: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { name: { [Op.like]: `%${search}%` } },
      ];
    }
    if (role) where.role = role;
    if (is_active !== undefined) where.is_active = is_active === 'true';

    const { count, rows } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['hashed_password'] },
      order: [['created_at', 'DESC']],
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
 * PUT /api/admin/users/:id/status
 * Activate or deactivate a user account
 */
const updateUserStatus = async (req, res, next) => {
  try {
    const { is_active } = req.body;
    const user = await User.findByPk(req.params.id);

    if (!user) return error(res, 'User not found.', 404);
    if (user.id === req.user.id) return error(res, 'Cannot modify your own status.', 400);

    await user.update({ is_active });

    // Log admin action
    await SystemLog.create({
      admin_id: req.user.id,
      log_type: 'audit',
      action: is_active ? 'user_activated' : 'user_deactivated',
      target_table: 'users',
      target_id: user.id,
      details: { username: user.username },
      severity: 'info',
      ip_address: req.ip,
    });

    return success(res, { user: user.toSafeJSON() }, `User ${is_active ? 'activated' : 'deactivated'}.`);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/logs
 * Get system logs with filtering
 */
const getSystemLogs = async (req, res, next) => {
  try {
    const { log_type, severity, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (log_type) where.log_type = log_type;
    if (severity) where.severity = severity;

    const { count, rows } = await SystemLog.findAndCountAll({
      where,
      include: [
        { model: User, as: 'admin', attributes: ['id', 'username'] },
      ],
      order: [['created_at', 'DESC']],
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

module.exports = {
  getDashboard,
  getUsers,
  updateUserStatus,
  getSystemLogs,
};
