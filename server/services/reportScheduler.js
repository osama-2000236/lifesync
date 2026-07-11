// server/services/reportScheduler.js
// ============================================
// UC-14 scheduler: generate weekly report + notify once.
// Idempotent. Safe to run from process interval or external cron.
// ============================================

const {
  generateWeeklyReport,
  markReportNotified,
  findUsersDueForWeeklyReport,
  weekBoundsUtc,
} = require('./reportService');
const { notifyWeeklyReportReady } = require('./notificationService');

/**
 * Process one user: ensure report exists, notify if not yet notified.
 */
const processUserWeeklyReport = async (user, { at = new Date(), notify = true } = {}) => {
  const { report, created } = await generateWeeklyReport(user.id, { at });
  let notification = null;
  if (notify && !report.notified_at) {
    const result = await notifyWeeklyReportReady(user.id, report);
    if (!result.skipped) {
      await markReportNotified(report.id);
      report.notified_at = new Date().toISOString();
    }
    notification = result;
  }
  return { report, created, notification };
};

/**
 * Batch job for all due users. Never throws past the batch boundary.
 */
const runWeeklyReportJob = async ({ at = new Date() } = {}) => {
  const due = await findUsersDueForWeeklyReport({ at });
  const results = [];
  for (const { user } of due) {
    try {
      const r = await processUserWeeklyReport(user, { at, notify: true });
      results.push({ user_id: user.id, ok: true, ...r });
    } catch (err) {
      console.error(`[reportScheduler] user ${user.id} failed:`, err.message);
      results.push({ user_id: user.id, ok: false, error: err.message });
    }
  }
  return {
    week_key: weekBoundsUtc(at).week_key,
    processed: results.length,
    results,
  };
};

let intervalHandle = null;

/** Start hourly check (single-instance). Disable with REPORT_SCHEDULER=0. */
const startReportScheduler = () => {
  if (process.env.REPORT_SCHEDULER === '0' || process.env.REPORT_SCHEDULER === 'false') {
    console.log('[reportScheduler] disabled via REPORT_SCHEDULER');
    return;
  }
  if (intervalHandle) return;
  const everyMs = parseInt(process.env.REPORT_SCHEDULER_MS, 10) || 60 * 60 * 1000;
  // Stagger first run a few minutes after boot so DB is warm.
  const firstDelay = Math.min(everyMs, 3 * 60 * 1000);
  setTimeout(() => {
    runWeeklyReportJob().catch((e) => console.error('[reportScheduler]', e.message));
    intervalHandle = setInterval(() => {
      runWeeklyReportJob().catch((e) => console.error('[reportScheduler]', e.message));
    }, everyMs);
    if (intervalHandle.unref) intervalHandle.unref();
  }, firstDelay);
  console.log(`[reportScheduler] hourly job armed (first in ${Math.round(firstDelay / 1000)}s)`);
};

const stopReportScheduler = () => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};

module.exports = {
  processUserWeeklyReport,
  runWeeklyReportJob,
  startReportScheduler,
  stopReportScheduler,
};
