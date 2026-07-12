// server/services/reportService.js
// ============================================
// Weekly report lifecycle (UC-13): generate, list, download.
// Generation is idempotent per (user_id, week_key).
// PDF bytes are never stored — rendered from the frozen snapshot.
// ============================================

const { Op } = require('sequelize');
const WeeklyReport = require('../models/WeeklyReport');
const User = require('../models/User');
const { persistDashboardInsights } = require('./ai/dashboardInsightsService');
const { buildWeeklyReportPdf, freezeReportPayload } = require('./pdfReportBuilder');
const { buildDailyOverviewForUser } = require('./dailyOverviewBuilder');
const { isoWeekKey, weekBoundsUtc, weekBoundsForTimeZone } = require('../utils/isoWeek');

const toPublicReport = (row) => {
  const plain = row?.get ? row.get({ plain: true }) : row;
  if (!plain) return null;
  return {
    id: plain.id,
    user_id: plain.user_id,
    period_start: plain.period_start,
    period_end: plain.period_end,
    week_key: plain.week_key,
    summary: plain.summary,
    metrics_snapshot: plain.metrics_snapshot,
    recommendations: plain.recommendations,
    patterns: plain.patterns,
    source_summary_id: plain.source_summary_id,
    notified_at: plain.notified_at,
    generated_at: plain.generated_at,
    created_at: plain.created_at || plain.createdAt,
  };
};

/**
 * Generate (or return existing) weekly report for the user.
 * @param {boolean} [opts.force=false]  When true, re-freeze snapshot for this week (refresh logs/insights).
 * @returns {{ report: object, created: boolean, refreshed?: boolean }}
 */
const generateWeeklyReport = async (userId, { at = new Date(), force = false } = {}) => {
  const bounds = weekBoundsUtc(at);
  const existing = await WeeklyReport.findOne({
    where: { user_id: userId, week_key: bounds.week_key },
  });
  if (existing && !force) return { report: toPublicReport(existing), created: false };

  // Fresh insight snapshot + daily overview — both on the same ISO week as week_key.
  const [insights, dailyOverview] = await Promise.all([
    persistDashboardInsights(userId, { at }),
    buildDailyOverviewForUser(userId, bounds.period_start, bounds.period_end),
  ]);
  const frozen = freezeReportPayload({
    ...insights,
    daily_overview: dailyOverview,
  });

  // Refresh existing week in place (keeps id + notified_at; updates metrics/PDF source).
  if (existing && force) {
    await existing.update({
      period_start: bounds.period_start,
      period_end: bounds.period_end,
      summary: frozen.summary,
      metrics_snapshot: frozen.metrics_snapshot,
      recommendations: frozen.recommendations,
      patterns: frozen.patterns,
      source_summary_id: insights.id || null,
      generated_at: new Date(),
    });
    return { report: toPublicReport(existing), created: false, refreshed: true };
  }

  try {
    const row = await WeeklyReport.create({
      user_id: userId,
      period_start: bounds.period_start,
      period_end: bounds.period_end,
      week_key: bounds.week_key,
      summary: frozen.summary,
      metrics_snapshot: frozen.metrics_snapshot,
      recommendations: frozen.recommendations,
      patterns: frozen.patterns,
      source_summary_id: insights.id || null,
      generated_at: new Date(),
    });
    return { report: toPublicReport(row), created: true };
  } catch (err) {
    // Race: unique (user_id, week_key) — re-read winner.
    if (err.name === 'SequelizeUniqueConstraintError') {
      const again = await WeeklyReport.findOne({
        where: { user_id: userId, week_key: bounds.week_key },
      });
      if (again) return { report: toPublicReport(again), created: false };
    }
    throw err;
  }
};

const listReports = async (userId, { limit = 12 } = {}) => {
  const rows = await WeeklyReport.findAll({
    where: { user_id: userId },
    order: [['period_end', 'DESC']],
    limit: Math.min(50, Math.max(1, limit)),
  });
  return rows.map(toPublicReport);
};

const getReportForUser = async (reportId, userId) => {
  const row = await WeeklyReport.findOne({
    where: { id: reportId, user_id: userId },
  });
  return toPublicReport(row);
};

/**
 * Ownership-checked PDF download. Returns null if not found / foreign.
 */
const downloadReportPdf = async (reportId, userId) => {
  const row = await WeeklyReport.findOne({
    where: { id: reportId, user_id: userId },
  });
  if (!row) return null;
  const user = await User.findByPk(userId, { attributes: ['id', 'name', 'email'] });
  const plain = row.get({ plain: true });
  const buffer = await buildWeeklyReportPdf({
    ...plain,
    user_name: user?.name || null,
    user_email: user?.email || null,
  });
  // Content-Disposition safe: strip quotes/path chars from week_key.
  const safeKey = String(plain.week_key || reportId).replace(/[^A-Za-z0-9._-]/g, '_');
  const filename = `lifesync-week-${safeKey}.pdf`;
  return { buffer, filename, report: toPublicReport(row) };
};

const markReportNotified = async (reportId) => {
  const row = await WeeklyReport.findByPk(reportId);
  if (!row) return null;
  if (row.notified_at) return row;
  await row.update({ notified_at: new Date() });
  return row;
};

/**
 * Users due for a weekly report/notify for *their* local ISO week.
 * `at` is the job instant (UTC). Each user's week_key comes from their IANA timezone.
 */
const findUsersDueForWeeklyReport = async ({ at = new Date() } = {}) => {
  const users = await User.findAll({
    where: {
      is_active: true,
      report_notify_enabled: true,
    },
    attributes: ['id', 'email', 'name', 'timezone', 'report_notify_enabled'],
  });
  const due = [];
  for (const user of users) {
    const bounds = weekBoundsForTimeZone(at, user.timezone || 'UTC');
    const existing = await WeeklyReport.findOne({
      where: { user_id: user.id, week_key: bounds.week_key },
    });
    if (!existing || !existing.notified_at) {
      due.push({
        user,
        week_key: bounds.week_key,
        period_start: bounds.period_start,
        period_end: bounds.period_end,
        // Local calendar noon — generateWeeklyReport freezes this user's week, not UTC's.
        at: bounds.at_local,
        timezone: bounds.timezone,
        existing,
      });
    }
  }
  return due;
};

module.exports = {
  isoWeekKey,
  weekBoundsUtc,
  weekBoundsForTimeZone,
  toPublicReport,
  generateWeeklyReport,
  listReports,
  getReportForUser,
  downloadReportPdf,
  markReportNotified,
  findUsersDueForWeeklyReport,
};
