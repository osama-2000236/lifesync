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
const WeeklyReport = require('../models/WeeklyReport');
const UserNotification = require('../models/UserNotification');
const UserIntegration = require('../models/UserIntegration');
const { sequelize } = require('../config/database');
const { success, paginated, error } = require('../utils/responseHelper');
const { redisStatus, redisEnabled } = require('../services/ephemeralStore');

/**
 * Secret-free AI stack snapshot for admins (never returns keys).
 */
const loadAiSnapshot = async () => {
  try {
    const { getAIProviderStatus } = require('../services/ai/providerClient');
    const [chat, bert, openrouter] = await Promise.all([
      getAIProviderStatus('chat'),
      getAIProviderStatus('chat', 'bert_local'),
      getAIProviderStatus('chat', 'openrouter'),
    ]);
    return {
      chat_provider: chat.provider || null,
      chat_status: chat.status || null,
      bert_status: bert.status || null,
      openrouter_status: openrouter.status || null,
      google_fit_configured: (() => {
        try {
          const GoogleFitAdapter = require('../services/external/googleFitAdapter');
          return new GoogleFitAdapter().isConfigured();
        } catch {
          return false;
        }
      })(),
    };
  } catch (err) {
    return { error: err.message || 'ai_status_unavailable' };
  }
};

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
    const adminUsers = await User.count({ where: { role: 'admin' } });

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

    // Product surface counters (UC-13/14/15)
    const [reportsTotal, reportsThisWeek, notificationsUnread, integrationsConnected] = await Promise.all([
      WeeklyReport.count().catch(() => 0),
      WeeklyReport.count({ where: { generated_at: { [Op.gte]: weekAgo } } }).catch(() => 0),
      UserNotification.count({ where: { read_at: null } }).catch(() => 0),
      UserIntegration.count().catch(() => 0),
    ]);

    const redis = await redisStatus();
    const ai = await loadAiSnapshot();

    const systemStatus = recentErrors > 10
      ? 'degraded'
      : (redis.configured && redis.ok === false ? 'degraded' : 'healthy');

    return success(res, {
      users: {
        total: totalUsers,
        active: activeUsers,
        new_this_week: newUsersThisWeek,
        admins: adminUsers,
      },
      activity_24h: {
        health_logs: healthLogsToday,
        finance_logs: financeLogsToday,
        chat_messages: chatMessagesToday,
      },
      product: {
        weekly_reports_total: reportsTotal,
        weekly_reports_this_week: reportsThisWeek,
        notifications_unread: notificationsUnread,
        integrations_connected: integrationsConnected,
      },
      runtime: {
        redis: {
          configured: redis.configured,
          ok: redis.ok,
          mode: redis.configured ? 'redis' : 'memory',
        },
        ephemeral_store: redisEnabled() ? 'redis' : 'memory',
        env: process.env.NODE_ENV || 'development',
        commit: (
          process.env.RAILWAY_GIT_COMMIT_SHA
          || process.env.GIT_COMMIT_SHA
          || process.env.SOURCE_VERSION
          || ''
        ).slice(0, 12) || null,
        ai,
      },
      system: {
        errors_24h: recentErrors,
        nlp_avg_ms: Math.round(avgNlpTime?.avg_ms || 0),
        nlp_max_ms: avgNlpTime?.max_ms || 0,
        status: systemStatus,
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
    const { search, role, is_active } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const where = {};
    if (search) {
      const q = String(search).slice(0, 200);
      where[Op.or] = [
        { username: { [Op.like]: `%${q}%` } },
        { email: { [Op.like]: `%${q}%` } },
        { name: { [Op.like]: `%${q}%` } },
      ];
    }
    if (role === 'user' || role === 'admin') where.role = role;
    if (is_active !== undefined) where.is_active = is_active === 'true';

    const { count, rows } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['hashed_password'] },
      order: [['created_at', 'DESC']],
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
 * PUT /api/admin/users/:id/status
 * Activate or deactivate a user account
 */
const updateUserStatus = async (req, res, next) => {
  try {
    const { is_active } = req.body;
    if (typeof is_active !== 'boolean') {
      return error(res, 'is_active must be a boolean.', 400);
    }
    const user = await User.findByPk(req.params.id);

    if (!user) return error(res, 'User not found.', 404);
    if (user.id === req.user.id) return error(res, 'Cannot modify your own status.', 400);
    // Prevent lockout: only when deactivating an *currently active* admin.
    if (user.role === 'admin' && user.is_active === true && is_active === false) {
      const adminCount = await User.count({ where: { role: 'admin', is_active: true } });
      if (adminCount <= 1) {
        return error(res, 'Cannot deactivate the last active admin.', 400, 'LAST_ADMIN');
      }
    }

    const before = user.is_active;
    await user.update({ is_active: Boolean(is_active) });

    // Log admin action (auditable before/after)
    await SystemLog.create({
      admin_id: req.user.id,
      log_type: 'audit',
      action: is_active ? 'user_activated' : 'user_deactivated',
      target_table: 'users',
      target_id: user.id,
      details: {
        username: user.username,
        email: user.email,
        before: { is_active: before },
        after: { is_active: Boolean(is_active) },
      },
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
    const { log_type, severity } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const where = {};
    const allowedTypes = ['audit', 'error', 'performance', 'security', 'system'];
    const allowedSeverity = ['info', 'warning', 'error', 'critical'];
    if (allowedTypes.includes(log_type)) where.log_type = log_type;
    if (allowedSeverity.includes(severity)) where.severity = severity;

    const { count, rows } = await SystemLog.findAndCountAll({
      where,
      include: [
        { model: User, as: 'admin', attributes: ['id', 'username'] },
      ],
      order: [['created_at', 'DESC']],
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

module.exports = {
  getDashboard,
  getUsers,
  updateUserStatus,
  getSystemLogs,
};
