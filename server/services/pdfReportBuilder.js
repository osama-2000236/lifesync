// server/services/pdfReportBuilder.js
// ============================================
// Deterministic PDF builder for weekly reports (UC-13).
// Pure function of a frozen metrics snapshot — no I/O, no AI calls.
// ============================================

const PDFDocument = require('pdfkit');

const asDate = (value) => {
  if (!value) return '—';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

/** Human-readable line for PDF — prefer text/observation, never raw JSON when avoidable. */
const lineText = (value) => {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((v) => lineText(v)).filter((s) => s && s !== '—').join('; ') || '—';
  }
  if (typeof value === 'object') {
    // insightEngine patterns use observation; recs use text; categories use name/category
    if (value.text != null && value.text !== '') return String(value.text);
    if (value.observation != null && value.observation !== '') return String(value.observation);
    if (value.name != null && value.name !== '') return String(value.name);
    if (value.category != null) {
      const pct = value.percentage != null ? ` ${value.percentage}%` : '';
      return `${value.category}${pct}`;
    }
    return JSON.stringify(value);
  }
  return String(value);
};

/**
 * Build a multi-page PDF Buffer from a weekly report plain object.
 * @param {object} report  weekly_reports row (plain) + optional user_name
 * @returns {Promise<Buffer>}
 */
const buildWeeklyReportPdf = (report) => new Promise((resolve, reject) => {
  try {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `LifeSync Weekly Report ${report.week_key || ''}`.trim(),
        Author: 'LifeSync',
        Subject: 'Weekly health and finance summary',
      },
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const metrics = report.metrics_snapshot || {};
    const recs = Array.isArray(report.recommendations) ? report.recommendations : [];
    const patterns = Array.isArray(report.patterns)
      ? report.patterns
      : (report.patterns && typeof report.patterns === 'object'
        ? Object.entries(report.patterns).map(([k, v]) => `${k}: ${lineText(v)}`)
        : []);

    // Header
    doc.fontSize(20).fillColor('#0f172a').text('LifeSync Weekly Report', { align: 'left' });
    doc.moveDown(0.3);
    // ASCII separators only — Helvetica/WinAnsi mangles Unicode arrows (→).
    doc.fontSize(10).fillColor('#64748b').text(
      `Week ${report.week_key || '—'}  |  ${asDate(report.period_start)} -> ${asDate(report.period_end)}`,
    );
    if (report.user_name || report.user_email) {
      doc.text(`Prepared for: ${report.user_name || report.user_email}`);
    }
    doc.text(`Generated: ${asDate(report.generated_at || new Date())}`);
    doc.moveDown(0.8);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
    doc.moveDown(0.8);

    // Scores
    doc.fontSize(14).fillColor('#0f172a').text('Scores');
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#334155');
    doc.text(`Health score: ${metrics.health_score ?? '—'} / 100`);
    doc.text(`Financial health score: ${metrics.financial_health_score ?? '—'} / 100`);
    doc.text(`Mood trend: ${lineText(metrics.mood_trend)}`);
    doc.text(`Spending trend: ${lineText(metrics.spending_trend)}`);
    doc.moveDown(0.6);

    // Budget
    if (metrics.budget || metrics.budget_summary) {
      const budget = metrics.budget || metrics.budget_summary;
      doc.fontSize(14).fillColor('#0f172a').text('Budget snapshot');
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor('#334155');
      if (typeof budget === 'object') {
        Object.entries(budget).forEach(([k, v]) => {
          doc.text(`${k.replace(/_/g, ' ')}: ${lineText(v)}`);
        });
      } else {
        doc.text(lineText(budget));
      }
      doc.moveDown(0.6);
    }

    // Narrative
    doc.fontSize(14).fillColor('#0f172a').text('Summary');
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#334155').text(report.summary || 'No summary available.', {
      align: 'left',
      lineGap: 2,
    });
    doc.moveDown(0.6);

    // Patterns
    if (patterns.length) {
      doc.fontSize(14).fillColor('#0f172a').text('Patterns');
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor('#334155');
      patterns.slice(0, 12).forEach((p, i) => {
        doc.text(`${i + 1}. ${lineText(p)}`);
      });
      doc.moveDown(0.6);
    }

    // Recommendations
    if (recs.length) {
      doc.fontSize(14).fillColor('#0f172a').text('Recommendations');
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor('#334155');
      recs.slice(0, 8).forEach((r, i) => {
        const priority = r.priority ? ` [${r.priority}]` : '';
        doc.text(`${i + 1}. ${lineText(r.text || r)}${priority}`);
      });
      doc.moveDown(0.6);
    }

    // Cross-domain
    if (metrics.cross_domain || metrics.cross_domain_insights) {
      const xd = metrics.cross_domain || metrics.cross_domain_insights;
      doc.fontSize(14).fillColor('#0f172a').text('Cross-domain notes');
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor('#334155').text(lineText(xd), { lineGap: 2 });
      doc.moveDown(0.6);
    }

    // Footer disclaimer
    doc.moveDown(1);
    doc.fontSize(8).fillColor('#94a3b8').text(
      'This report is generated from your LifeSync health and finance logs. '
      + 'It is not medical or financial advice. Scores are deterministic dashboard metrics; '
      + 'narrative text may include model-assisted wording labeled in product UI.',
      { align: 'left' },
    );

    doc.end();
  } catch (err) {
    reject(err);
  }
});

module.exports = {
  buildWeeklyReportPdf,
  asDate,
  lineText,
};
