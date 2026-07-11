// server/controllers/reportController.js
// UC-13 weekly PDF reports + UC-14 notification preference hooks.

const { body, param, query } = require('express-validator');
const {
  generateWeeklyReport,
  listReports,
  getReportForUser,
  downloadReportPdf,
} = require('../services/reportService');
const { processUserWeeklyReport, runWeeklyReportJob } = require('../services/reportScheduler');
const {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
} = require('../services/notificationService');
const User = require('../models/User');
const { success, created, error } = require('../utils/responseHelper');

const generateValidation = [];

const idValidation = [
  param('id').isInt({ min: 1 }).withMessage('Invalid report id.'),
];

const listReportsHandler = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 12;
    const reports = await listReports(req.user.id, { limit });
    return success(res, { reports }, 'Weekly reports');
  } catch (err) {
    next(err);
  }
};

const generateReportHandler = async (req, res, next) => {
  try {
    const notify = req.body?.notify !== false;
    const result = await processUserWeeklyReport(req.user, { notify });
    const statusFn = result.created ? created : success;
    return statusFn(res, {
      report: result.report,
      created: result.created,
      notification: result.notification?.notification || null,
    }, result.created ? 'Weekly report generated' : 'Weekly report already exists');
  } catch (err) {
    next(err);
  }
};

const getReportHandler = async (req, res, next) => {
  try {
    const report = await getReportForUser(req.params.id, req.user.id);
    if (!report) return error(res, 'Report not found.', 404, 'NOT_FOUND');
    return success(res, { report }, 'Weekly report');
  } catch (err) {
    next(err);
  }
};

const downloadReportHandler = async (req, res, next) => {
  try {
    const payload = await downloadReportPdf(req.params.id, req.user.id);
    if (!payload) return error(res, 'Report not found.', 404, 'NOT_FOUND');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${payload.filename}"`);
    res.setHeader('Content-Length', payload.buffer.length);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(payload.buffer);
  } catch (err) {
    next(err);
  }
};

const listNotificationsHandler = async (req, res, next) => {
  try {
    const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';
    const notifications = await listNotifications(req.user.id, {
      limit: parseInt(req.query.limit, 10) || 30,
      unreadOnly,
    });
    const unread = await unreadCount(req.user.id);
    return success(res, { notifications, unread_count: unread }, 'Notifications');
  } catch (err) {
    next(err);
  }
};

const markNotificationReadHandler = async (req, res, next) => {
  try {
    const row = await markRead(req.params.id, req.user.id);
    if (!row) return error(res, 'Notification not found.', 404, 'NOT_FOUND');
    return success(res, { notification: row }, 'Notification marked read');
  } catch (err) {
    next(err);
  }
};

const markAllNotificationsReadHandler = async (req, res, next) => {
  try {
    const count = await markAllRead(req.user.id);
    return success(res, { updated: count }, 'All notifications marked read');
  } catch (err) {
    next(err);
  }
};

const updateNotifyPrefsValidation = [
  body('report_notify_enabled').optional().isBoolean(),
  body('timezone').optional().isString().isLength({ min: 1, max: 64 }),
];

const updateNotifyPrefsHandler = async (req, res, next) => {
  try {
    const updates = {};
    if (typeof req.body.report_notify_enabled === 'boolean') {
      updates.report_notify_enabled = req.body.report_notify_enabled;
    }
    if (typeof req.body.timezone === 'string' && req.body.timezone.trim()) {
      updates.timezone = req.body.timezone.trim();
    }
    if (!Object.keys(updates).length) {
      return error(res, 'No preference fields provided.', 400, 'VALIDATION_ERROR');
    }
    await req.user.update(updates);
    const user = await User.findByPk(req.user.id);
    return success(res, { user: user.toSafeJSON() }, 'Notification preferences updated');
  } catch (err) {
    next(err);
  }
};

/**
 * External/cron entry. Requires REPORT_CRON_SECRET via header X-Report-Cron-Secret.
 * When secret unset, route is 404 (dormant — same posture as QA login).
 */
const runCronHandler = async (req, res, next) => {
  try {
    const expected = process.env.REPORT_CRON_SECRET;
    if (!expected) {
      return error(res, 'Not found.', 404, 'NOT_FOUND');
    }
    const presented = req.headers['x-report-cron-secret'];
    if (!presented || presented !== expected) {
      return error(res, 'Access denied.', 401, 'CRON_FORBIDDEN');
    }
    const batch = await runWeeklyReportJob();
    return success(res, batch, 'Weekly report job finished');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listReportsHandler,
  generateReportHandler,
  getReportHandler,
  downloadReportHandler,
  listNotificationsHandler,
  markNotificationReadHandler,
  markAllNotificationsReadHandler,
  updateNotifyPrefsHandler,
  updateNotifyPrefsValidation,
  generateValidation,
  idValidation,
  runCronHandler,
};
