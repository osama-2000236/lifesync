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
const { buildWeeklyReportPdf } = require('./pdfReportBuilder');

/** ISO week key YYYY-Www (UTC). Pure — easy to unit-test. */
const isoWeekKey = (date = new Date()) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday in current week decides the year.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

/** Monday–Sunday (UTC) for a Date in that week. */
const weekBoundsUtc = (date = new Date()) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() - day + 1);
  const start = new Date(d);
  const end = new Date(d);
  end.setUTCDate(end.getUTCDate() + 6);
  const toDateOnly = (x) => x.toISOString().slice(0, 10);
  return { period_start: toDateOnly(start), period_end: toDateOnly(end), week_key: isoWeekKey(date) };
};

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
 * @returns {{ report: object, created: boolean }}
 */
const generateWeeklyReport = async (userId, { at = new Date() } = {}) => {
  const bounds = weekBoundsUtc(at);
  const existing = await WeeklyReport.findOne({
    where: { user_id: userId, week_key: bounds.week_key },
  });
  if (existing) return { report: toPublicReport(existing), created: false };

  // Force a fresh insight snapshot, then freeze it into weekly_reports.
  const insights = await persistDashboardInsights(userId);
  const periodStart = insights.period?.start
    ? new Date(insights.period.start).toISOString().slice(0, 10)
    : bounds.period_start;
  const periodEnd = insights.period?.end
    ? new Date(insights.period.end).toISOString().slice(0, 10)
    : bounds.period_end;

  try {
    const row = await WeeklyReport.create({
      user_id: userId,
      period_start: periodStart,
      period_end: periodEnd,
      week_key: bounds.week_key,
      summary: insights.summary || 'Weekly summary.',
      metrics_snapshot: {
        health_score: insights.health_score,
        financial_health_score: insights.financial_health_score,
        mood_trend: insights.mood_trend,
        spending_trend: insights.spending_trend,
        budget: insights.budget_summary,
        cross_domain: insights.cross_domain_insights,
        model_runtime: insights.model_runtime,
      },
      recommendations: insights.recommendations || [],
      patterns: insights.patterns || [],
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
  const filename = `lifesync-week-${plain.week_key || reportId}.pdf`;
  return { buffer, filename, report: toPublicReport(row) };
};

const markReportNotified = async (reportId) => {
  const row = await WeeklyReport.findByPk(reportId);
  if (!row) return null;
  if (row.notified_at) return row;
  await row.update({ notified_at: new Date() });
  return row;
};

const findUsersDueForWeeklyReport = async ({ at = new Date() } = {}) => {
  const { week_key } = weekBoundsUtc(at);
  // Active users with notifications on who do not yet have this week’s report notified.
  const users = await User.findAll({
    where: {
      is_active: true,
      report_notify_enabled: true,
    },
    attributes: ['id', 'email', 'name', 'timezone', 'report_notify_enabled'],
  });
  const due = [];
  for (const user of users) {
    const existing = await WeeklyReport.findOne({
      where: { user_id: user.id, week_key },
    });
    if (!existing || !existing.notified_at) {
      due.push({ user, week_key, existing });
    }
  }
  return due;
};

module.exports = {
  isoWeekKey,
  weekBoundsUtc,
  toPublicReport,
  generateWeeklyReport,
  listReports,
  getReportForUser,
  downloadReportPdf,
  markReportNotified,
  findUsersDueForWeeklyReport,
};
