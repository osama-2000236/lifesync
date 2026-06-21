// server/controllers/reportController.js
// ============================================
// Report Controller — UR12
// Generate, list, view and download weekly reports (JSON / CSV / HTML).
// ============================================

const { Op, fn, col } = require('sequelize');
const HealthLog = require('../models/HealthLog');
const FinancialLog = require('../models/FinancialLog');
const Category = require('../models/Category');
const Report = require('../models/Report');
const { getCurrentInsights } = require('../services/ai/insightsService');
const { createNotification } = require('../services/notificationService');
const { success, created, paginated, error } = require('../utils/responseHelper');

const num = (v) => Number(v) || 0;
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ────────────────────────────────────────────
// Data gathering
// ────────────────────────────────────────────

const gatherReportContent = async (userId) => {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const where = { user_id: userId, logged_at: { [Op.gte]: weekAgo } };

  const healthAgg = await HealthLog.findAll({
    where,
    attributes: [
      'type',
      [fn('AVG', col('value')), 'avg_value'],
      [fn('SUM', col('value')), 'total_value'],
      [fn('COUNT', col('id')), 'entry_count'],
    ],
    group: ['type'],
    raw: true,
  });

  const financeAgg = await FinancialLog.findAll({
    where,
    include: [{ model: Category, as: 'category', attributes: ['name'] }],
    attributes: [
      'type',
      'category_id',
      [fn('SUM', col('amount')), 'total'],
      [fn('COUNT', col('financial_logs.id')), 'count'],
    ],
    group: ['type', 'category_id', 'category.id'],
    raw: true,
    nest: true,
  });

  const income = financeAgg.filter((f) => f.type === 'income').reduce((s, f) => s + num(f.total), 0);
  const expenses = financeAgg.filter((f) => f.type === 'expense').reduce((s, f) => s + num(f.total), 0);
  const byCategory = financeAgg
    .filter((f) => f.type === 'expense')
    .map((f) => ({ category: f.category?.name || 'Uncategorized', total: num(f.total), count: num(f.count) }))
    .sort((a, b) => b.total - a.total);

  // Insights (statistical + BERT narrative). Tolerate failure.
  let insights = {};
  try {
    insights = await getCurrentInsights(userId);
  } catch (err) {
    insights = { summary: 'Insights unavailable for this period.' };
  }

  return {
    title: `Weekly LifeSync Report — ${weekAgo.toISOString().split('T')[0]} to ${now.toISOString().split('T')[0]}`,
    period: { start: weekAgo.toISOString().split('T')[0], end: now.toISOString().split('T')[0] },
    generated_at: now.toISOString(),
    scores: {
      health: insights.health_score ?? null,
      financial: insights.financial_health_score ?? null,
    },
    summary: insights.summary || '',
    headline: insights.headline || null,
    mood_sentiment: insights.mood_sentiment || null,
    spending_behavior: insights.spending_behavior || null,
    model_used: insights.model_used || 'statistical',
    recommendations: insights.recommendations || [],
    health: healthAgg.map((h) => ({
      type: h.type,
      average: Math.round(num(h.avg_value) * 100) / 100,
      total: Math.round(num(h.total_value) * 100) / 100,
      entries: num(h.entry_count),
    })),
    finance: {
      income_total: Math.round(income * 100) / 100,
      expense_total: Math.round(expenses * 100) / 100,
      net: Math.round((income - expenses) * 100) / 100,
      savings_rate: income > 0 ? Math.round(((income - expenses) / income) * 1000) / 10 : 0,
      by_category: byCategory,
    },
  };
};

// ────────────────────────────────────────────
// Renderers
// ────────────────────────────────────────────

const toCSV = (content) => {
  const lines = [];
  lines.push('LifeSync Weekly Report');
  lines.push(`Period,${content.period.start} to ${content.period.end}`);
  lines.push(`Generated,${content.generated_at}`);
  lines.push(`Health Score,${content.scores.health ?? 'N/A'}`);
  lines.push(`Financial Score,${content.scores.financial ?? 'N/A'}`);
  lines.push('');
  lines.push('Health Metric,Average,Total,Entries');
  content.health.forEach((h) => lines.push(`${h.type},${h.average},${h.total},${h.entries}`));
  lines.push('');
  lines.push('Finance Summary,Amount');
  lines.push(`Income,${content.finance.income_total}`);
  lines.push(`Expenses,${content.finance.expense_total}`);
  lines.push(`Net,${content.finance.net}`);
  lines.push(`Savings Rate %,${content.finance.savings_rate}`);
  lines.push('');
  lines.push('Expense Category,Total,Count');
  content.finance.by_category.forEach((c) => lines.push(`${c.category},${c.total},${c.count}`));
  lines.push('');
  lines.push('Recommendations');
  (content.recommendations || []).forEach((r) => lines.push(`"${String(r.text || '').replace(/"/g, '""')}"`));
  return lines.join('\n');
};

const toHTML = (content) => {
  const healthRows = content.health.map((h) =>
    `<tr><td>${esc(h.type)}</td><td>${esc(h.average)}</td><td>${esc(h.total)}</td><td>${esc(h.entries)}</td></tr>`).join('');
  const catRows = content.finance.by_category.map((c) =>
    `<tr><td>${esc(c.category)}</td><td>$${esc(c.total)}</td><td>${esc(c.count)}</td></tr>`).join('');
  const recItems = (content.recommendations || []).map((r) =>
    `<li><strong>[${esc(r.priority || 'info')}]</strong> ${esc(r.text)}</li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(content.title)}</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:800px;margin:24px auto;color:#1a1a2e;padding:0 16px}
  h1{font-size:22px} h2{font-size:16px;border-bottom:2px solid #6c5ce7;padding-bottom:4px;margin-top:28px}
  .scores{display:flex;gap:16px;margin:16px 0}
  .score{flex:1;background:#f4f3ff;border-radius:12px;padding:16px;text-align:center}
  .score b{display:block;font-size:28px;color:#6c5ce7}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{text-align:left;padding:8px;border-bottom:1px solid #eee;font-size:14px}
  .muted{color:#666;font-size:13px} .tag{display:inline-block;background:#eef;border-radius:8px;padding:2px 8px;font-size:12px}
  @media print{button{display:none}}
</style></head><body>
  <h1>${esc(content.title)}</h1>
  <p class="muted">Generated ${esc(content.generated_at)} · model: <span class="tag">${esc(content.model_used)}</span></p>
  ${content.headline ? `<p><strong>${esc(content.headline)}</strong></p>` : ''}
  <p>${esc(content.summary)}</p>
  <div class="scores">
    <div class="score"><b>${esc(content.scores.health ?? 'N/A')}</b>Health Score</div>
    <div class="score"><b>${esc(content.scores.financial ?? 'N/A')}</b>Financial Score</div>
  </div>
  <h2>Health</h2>
  <table><tr><th>Metric</th><th>Average</th><th>Total</th><th>Entries</th></tr>${healthRows || '<tr><td colspan=4 class=muted>No health data</td></tr>'}</table>
  <h2>Finance</h2>
  <p>Income: <strong>$${esc(content.finance.income_total)}</strong> · Expenses: <strong>$${esc(content.finance.expense_total)}</strong> · Net: <strong>$${esc(content.finance.net)}</strong> · Savings rate: <strong>${esc(content.finance.savings_rate)}%</strong></p>
  <table><tr><th>Category</th><th>Total</th><th>Count</th></tr>${catRows || '<tr><td colspan=3 class=muted>No expenses</td></tr>'}</table>
  <h2>Recommendations</h2>
  <ul>${recItems || '<li class="muted">Keep logging for personalized recommendations.</li>'}</ul>
  <button onclick="window.print()">Print / Save as PDF</button>
</body></html>`;
};

// ────────────────────────────────────────────
// Handlers
// ────────────────────────────────────────────

/** POST /api/reports/generate */
const generateReport = async (req, res, next) => {
  try {
    const content = await gatherReportContent(req.user.id);
    const report = await Report.create({
      user_id: req.user.id,
      type: 'weekly',
      title: content.title,
      period_start: content.period.start,
      period_end: content.period.end,
      content,
      generated_at: new Date(),
    });

    await createNotification({
      userId: req.user.id,
      type: 'report',
      title: 'Weekly report ready',
      message: 'Your weekly LifeSync report has been generated and is ready to download.',
      link: '/dashboard',
      metadata: { report_id: report.id },
    });

    return created(res, { report }, 'Report generated');
  } catch (err) {
    next(err);
  }
};

/** GET /api/reports */
const listReports = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const { count, rows } = await Report.findAndCountAll({
      where: { user_id: req.user.id },
      attributes: ['id', 'type', 'title', 'period_start', 'period_end', 'generated_at'],
      order: [['generated_at', 'DESC']],
      limit,
      offset,
    });

    return paginated(res, rows, { page, limit, total: count, totalPages: Math.ceil(count / limit) }, 'Reports');
  } catch (err) {
    next(err);
  }
};

/** GET /api/reports/:id */
const getReport = async (req, res, next) => {
  try {
    const report = await Report.findOne({ where: { id: req.params.id, user_id: req.user.id } });
    if (!report) return error(res, 'Report not found', 404);
    return success(res, { report }, 'Report');
  } catch (err) {
    next(err);
  }
};

/** GET /api/reports/:id/download?format=json|csv|html */
const downloadReport = async (req, res, next) => {
  try {
    const report = await Report.findOne({ where: { id: req.params.id, user_id: req.user.id } });
    if (!report) return error(res, 'Report not found', 404);

    const content = typeof report.content === 'string' ? JSON.parse(report.content) : report.content;
    const format = String(req.query.format || 'json').toLowerCase();
    const base = `lifesync-report-${report.id}-${report.period_end}`;

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
      return res.send(toCSV(content));
    }
    if (format === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename="${base}.html"`);
      return res.send(toHTML(content));
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.json"`);
    return res.send(JSON.stringify(content, null, 2));
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/reports/:id */
const deleteReport = async (req, res, next) => {
  try {
    const deleted = await Report.destroy({ where: { id: req.params.id, user_id: req.user.id } });
    if (!deleted) return error(res, 'Report not found', 404);
    return success(res, null, 'Report deleted');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  generateReport,
  listReports,
  getReport,
  downloadReport,
  deleteReport,
  _gatherReportContent: gatherReportContent,
  _toCSV: toCSV,
  _toHTML: toHTML,
};
