// server/services/pdfReportBuilder.js
// ============================================
// Deterministic PDF builder for weekly reports (UC-13).
// Pure function of a frozen metrics snapshot — no I/O, no AI calls.
// All display values are sanitized so PDFs never show NaN/JSON/undefined.
// ============================================

const PDFDocument = require('pdfkit');

const MISSING = '—';

const asDate = (value) => {
  if (value == null || value === '') return MISSING;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return MISSING;
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : MISSING;
};

/** Finite score in 0–100, or null if unusable. */
const clampScore = (value) => {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
};

const scoreDisplay = (value) => {
  const s = clampScore(value);
  return s == null ? MISSING : String(s);
};

/** Finite number (money/rate), or null. */
const finiteNumber = (value) => {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
};

const sanitizeTrend = (value) => {
  if (value == null || value === '') return null;
  let raw = value;
  if (typeof value === 'object') {
    raw = value.trend || value.text || value.observation || '';
  }
  const s = String(raw).trim().replace(/\s+/g, ' ');
  if (!s || s === 'null' || s === 'undefined' || s === 'NaN') return null;
  if (s.startsWith('{') || s.startsWith('[')) return null;
  return s.slice(0, 48);
};

const sanitizeSummary = (value) => {
  const s = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  if (!s || s === 'null' || s === 'undefined') return 'Weekly summary.';
  return s.slice(0, 4000);
};

const sanitizeCrossDomain = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    const t = value.text || value.observation || value.summary;
    return t ? sanitizeCrossDomain(t) : null;
  }
  const s = String(value).trim().replace(/\s+/g, ' ');
  if (!s || s.startsWith('{') || s.startsWith('[')) return null;
  return s.slice(0, 2000);
};

const sanitizePriority = (p) => {
  if (p == null || p === '') return null;
  const s = String(p).trim().toLowerCase();
  if (['high', 'medium', 'low'].includes(s)) return s;
  return null;
};

const sanitizeCategory = (item) => {
  if (!item || typeof item !== 'object') return null;
  const name = item.category || item.name;
  if (name == null || String(name).trim() === '') return null;
  const pct = finiteNumber(item.percentage);
  const out = { category: String(name).trim().slice(0, 80) };
  if (pct != null) out.percentage = Math.max(0, Math.min(100, Math.round(pct)));
  return out;
};

const sanitizeBudget = (budget) => {
  if (budget == null) return null;
  if (typeof budget !== 'object' || Array.isArray(budget)) return null;
  const out = {};
  for (const [k, v] of Object.entries(budget)) {
    if (v == null || k === 'model_runtime') continue;
    if (k === 'top_categories') {
      if (!Array.isArray(v)) continue;
      const cats = v.map(sanitizeCategory).filter(Boolean).slice(0, 8);
      if (cats.length) out.top_categories = cats;
      continue;
    }
    const n = finiteNumber(v);
    if (n != null) {
      out[k] = n;
      continue;
    }
    // Skip nested junk; only flat numbers + top_categories are valid.
  }
  return Object.keys(out).length ? out : null;
};

const sanitizePatterns = (patterns) => {
  if (!Array.isArray(patterns)) return [];
  const out = [];
  for (const p of patterns) {
    if (out.length >= 12) break;
    if (typeof p === 'string') {
      const t = p.trim();
      if (t && !t.startsWith('{')) out.push({ observation: t.slice(0, 500) });
      continue;
    }
    if (!p || typeof p !== 'object') continue;
    const text = p.text || p.observation;
    if (text == null || String(text).trim() === '') continue;
    const t = String(text).trim();
    if (t.startsWith('{') || t.startsWith('[')) continue;
    const item = { observation: t.slice(0, 500) };
    if (p.domain) item.domain = String(p.domain).slice(0, 40);
    if (p.severity) item.severity = String(p.severity).slice(0, 40);
    out.push(item);
  }
  return out;
};

const sanitizeRecommendations = (recs) => {
  if (!Array.isArray(recs)) return [];
  const out = [];
  for (const r of recs) {
    if (out.length >= 8) break;
    if (typeof r === 'string') {
      const t = r.trim();
      if (t) out.push({ text: t.slice(0, 300) });
      continue;
    }
    if (!r || typeof r !== 'object') continue;
    const text = r.text;
    if (text == null || String(text).trim() === '') continue;
    const item = { text: String(text).trim().slice(0, 300) };
    const pr = sanitizePriority(r.priority);
    if (pr) item.priority = pr;
    out.push(item);
  }
  return out;
};

/**
 * Freeze-safe metrics + lists from raw insights (or a stored row).
 * Guarantees scores are 0–100 or null, no NaN, human pattern/rec text only.
 */
const freezeReportPayload = (insights = {}) => {
  const budget = sanitizeBudget(insights.budget_summary ?? insights.budget
    ?? insights.metrics_snapshot?.budget);
  const cross = sanitizeCrossDomain(
    insights.cross_domain_insights
      ?? insights.cross_domain
      ?? insights.metrics_snapshot?.cross_domain,
  );
  const metrics_snapshot = {
    health_score: clampScore(
      insights.health_score ?? insights.metrics_snapshot?.health_score,
    ),
    financial_health_score: clampScore(
      insights.financial_health_score ?? insights.metrics_snapshot?.financial_health_score,
    ),
    mood_trend: sanitizeTrend(
      insights.mood_trend ?? insights.metrics_snapshot?.mood_trend,
    ),
    spending_trend: sanitizeTrend(
      insights.spending_trend ?? insights.metrics_snapshot?.spending_trend,
    ),
    budget,
    cross_domain: cross,
  };
  const rt = insights.model_runtime ?? insights.metrics_snapshot?.model_runtime;
  if (rt && typeof rt === 'object' && rt.status) {
    const mr = { status: String(rt.status).slice(0, 64) };
    if (rt.operating_mode) mr.operating_mode = String(rt.operating_mode).slice(0, 80);
    metrics_snapshot.model_runtime = mr;
  }
  return {
    summary: sanitizeSummary(insights.summary),
    metrics_snapshot,
    recommendations: sanitizeRecommendations(
      insights.recommendations ?? insights.metrics_snapshot?.recommendations,
    ),
    patterns: sanitizePatterns(insights.patterns ?? insights.metrics_snapshot?.patterns),
  };
};

/** Human-readable line for PDF — prefer text/observation, never raw JSON when avoidable. */
const lineText = (value) => {
  if (value == null) return MISSING;
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s || s === 'null' || s === 'undefined' || s === 'NaN') return MISSING;
    if (s.startsWith('{') || s.startsWith('[')) return MISSING;
    return s;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : MISSING;
  }
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((v) => lineText(v)).filter((s) => s && s !== MISSING).join('; ') || MISSING;
  }
  if (typeof value === 'object') {
    if (value.text != null && value.text !== '') return lineText(String(value.text));
    if (value.observation != null && value.observation !== '') return lineText(String(value.observation));
    if (value.name != null && value.name !== '') return lineText(String(value.name));
    if (value.category != null) {
      const cat = sanitizeCategory(value);
      if (!cat) return MISSING;
      return cat.percentage != null ? `${cat.category} ${cat.percentage}%` : cat.category;
    }
    return MISSING; // never dump JSON into the PDF
  }
  return MISSING;
};

/**
 * Build a multi-page PDF Buffer from a weekly report plain object.
 * @param {object} report  weekly_reports row (plain) + optional user_name
 * @returns {Promise<Buffer>}
 */
const buildWeeklyReportPdf = (report) => new Promise((resolve, reject) => {
  try {
    const frozen = freezeReportPayload({
      summary: report.summary,
      recommendations: report.recommendations,
      patterns: report.patterns,
      metrics_snapshot: report.metrics_snapshot,
      health_score: report.metrics_snapshot?.health_score,
      financial_health_score: report.metrics_snapshot?.financial_health_score,
      mood_trend: report.metrics_snapshot?.mood_trend,
      spending_trend: report.metrics_snapshot?.spending_trend,
      budget: report.metrics_snapshot?.budget,
      cross_domain: report.metrics_snapshot?.cross_domain,
      model_runtime: report.metrics_snapshot?.model_runtime,
    });
    const metrics = frozen.metrics_snapshot;
    const recs = frozen.recommendations;
    const patterns = frozen.patterns;
    const weekKey = report.week_key && String(report.week_key).match(/^\d{4}-W\d{2}$/)
      ? report.week_key
      : (report.week_key ? String(report.week_key).replace(/[^\w.-]/g, '').slice(0, 16) : MISSING);

    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `LifeSync Weekly Report ${weekKey !== MISSING ? weekKey : ''}`.trim(),
        Author: 'LifeSync',
        Subject: 'Weekly health and finance summary',
      },
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).fillColor('#0f172a').text('LifeSync Weekly Report', { align: 'left' });
    doc.moveDown(0.3);
    // ASCII separators only — Helvetica/WinAnsi mangles Unicode arrows.
    doc.fontSize(10).fillColor('#64748b').text(
      `Week ${weekKey}  |  ${asDate(report.period_start)} -> ${asDate(report.period_end)}`,
    );
    if (report.user_name || report.user_email) {
      const who = String(report.user_name || report.user_email).trim().slice(0, 120);
      if (who) doc.text(`Prepared for: ${who}`);
    }
    doc.text(`Generated: ${asDate(report.generated_at || new Date())}`);
    doc.moveDown(0.8);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
    doc.moveDown(0.8);

    // Scores — always finite 0–100 or em dash
    doc.fontSize(14).fillColor('#0f172a').text('Scores');
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#334155');
    doc.text(`Health score: ${scoreDisplay(metrics.health_score)} / 100`);
    doc.text(`Financial health score: ${scoreDisplay(metrics.financial_health_score)} / 100`);
    doc.text(`Mood trend: ${lineText(metrics.mood_trend)}`);
    doc.text(`Spending trend: ${lineText(metrics.spending_trend)}`);
    doc.moveDown(0.6);

    // Budget (only when we have valid numbers)
    if (metrics.budget) {
      doc.fontSize(14).fillColor('#0f172a').text('Budget snapshot');
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor('#334155');
      Object.entries(metrics.budget).forEach(([k, v]) => {
        const label = k.replace(/_/g, ' ');
        const rendered = lineText(v);
        if (rendered !== MISSING) doc.text(`${label}: ${rendered}`);
      });
      doc.moveDown(0.6);
    }

    // Narrative
    doc.fontSize(14).fillColor('#0f172a').text('Summary');
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#334155').text(frozen.summary, {
      align: 'left',
      lineGap: 2,
    });
    doc.moveDown(0.6);

    // Patterns — only human-readable items
    if (patterns.length) {
      doc.fontSize(14).fillColor('#0f172a').text('Patterns');
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor('#334155');
      patterns.forEach((p, i) => {
        const t = lineText(p);
        if (t !== MISSING) doc.text(`${i + 1}. ${t}`);
      });
      doc.moveDown(0.6);
    }

    // Recommendations
    if (recs.length) {
      doc.fontSize(14).fillColor('#0f172a').text('Recommendations');
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor('#334155');
      recs.forEach((r, i) => {
        const t = lineText(r.text || r);
        if (t === MISSING) return;
        const priority = r.priority ? ` [${r.priority}]` : '';
        doc.text(`${i + 1}. ${t}${priority}`);
      });
      doc.moveDown(0.6);
    }

    // Cross-domain
    if (metrics.cross_domain) {
      doc.fontSize(14).fillColor('#0f172a').text('Cross-domain notes');
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor('#334155').text(lineText(metrics.cross_domain), { lineGap: 2 });
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
  clampScore,
  scoreDisplay,
  finiteNumber,
  sanitizeTrend,
  sanitizeSummary,
  sanitizeBudget,
  sanitizePatterns,
  sanitizeRecommendations,
  sanitizeCrossDomain,
  freezeReportPayload,
};
