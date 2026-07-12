// server/services/pdfReportBuilder.js
// ============================================
// Deterministic PDF builder for weekly reports (UC-13).
// Pure function of a frozen metrics snapshot — no I/O, no AI calls.
// Visual system mirrors the LifeSync dashboard (navy + emerald).
// All display values are sanitized so PDFs never show NaN/JSON/undefined.
// ============================================

const PDFDocument = require('pdfkit');
const { sanitizeDailyOverview } = require('./dailyOverviewBuilder');

const MISSING = '—';

/** Brand tokens from client/src/styles/globals.css (@theme). */
const BRAND = {
  navy900: '#102a43',
  navy800: '#243b53',
  navy700: '#334e68',
  navy500: '#627d98',
  navy400: '#829ab1',
  navy200: '#bcccdc',
  navy100: '#d9e2ec',
  navy50: '#f0f4f8',
  emerald600: '#059669',
  emerald500: '#10b981',
  emerald50: '#ecfdf5',
  coral500: '#f43f5e',
  amber500: '#f59e0b',
  surface: '#f8fafc',
  white: '#ffffff',
  body: '#334e68',
};

const PAGE = { left: 50, right: 545, width: 495, bottom: 780 };

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
  const daily = sanitizeDailyOverview(
    insights.daily_overview ?? insights.metrics_snapshot?.daily_overview,
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
    daily_overview: daily,
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

const ensureSpace = (doc, need = 80) => {
  if (doc.y + need > PAGE.bottom) {
    doc.addPage();
    doc.y = 50;
  }
};

const sectionTitle = (doc, title) => {
  ensureSpace(doc, 36);
  doc.moveDown(0.35);
  doc.fontSize(13).fillColor(BRAND.navy900).text(title, PAGE.left, doc.y, { width: PAGE.width });
  const y = doc.y + 4;
  doc.moveTo(PAGE.left, y).lineTo(PAGE.left + 36, y).strokeColor(BRAND.emerald500).lineWidth(2).stroke();
  doc.lineWidth(1);
  doc.y = y + 10;
};

const metricChip = (label, value) => {
  if (value == null || value === '' || value === MISSING) return null;
  return `${label} ${value}`;
};

const dayHighlights = (day) => {
  if (Array.isArray(day.notes) && day.notes.length) return day.notes.join('  ·  ');
  const parts = [
    metricChip('steps', day.steps != null ? day.steps.toLocaleString('en-US') : null),
    metricChip('sleep', day.sleep_h != null ? `${day.sleep_h}h` : null),
    metricChip('mood', day.mood != null ? `${day.mood}/10` : null),
    metricChip('water', day.water != null ? day.water : null),
    metricChip('exercise', day.exercise_min != null ? `${day.exercise_min}m` : null),
    day.expense > 0 ? `spent ${day.expense}` : null,
    day.income > 0 ? `income ${day.income}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join('  ·  ') : 'No logs this day';
};

const dayHeadline = (day) => {
  if (day.headline && String(day.headline).trim()) return String(day.headline).trim().slice(0, 100);
  const h = dayHighlights(day);
  return h.split('  ·  ')[0] || 'Day overview';
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
      daily_overview: report.metrics_snapshot?.daily_overview,
    });
    const metrics = frozen.metrics_snapshot;
    const recs = frozen.recommendations;
    const patterns = frozen.patterns;
    const daily = metrics.daily_overview;
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

    // ── Branded hero (navy band + emerald accent — matches dashboard ink/emerald) ──
    doc.rect(0, 0, 595.28, 118).fill(BRAND.navy900);
    doc.rect(0, 118, 595.28, 4).fill(BRAND.emerald500);
    doc.fillColor(BRAND.emerald500).fontSize(9).text('LIFESYNC', PAGE.left, 28, { characterSpacing: 1.5 });
    doc.fillColor(BRAND.white).fontSize(22).text('Weekly Report', PAGE.left, 44);
    doc.fontSize(10).fillColor(BRAND.navy200).text(
      `Week ${weekKey}  |  ${asDate(report.period_start)} -> ${asDate(report.period_end)}`,
      PAGE.left,
      74,
    );
    const who = report.user_name || report.user_email
      ? String(report.user_name || report.user_email).trim().slice(0, 80)
      : null;
    doc.fontSize(9).fillColor(BRAND.navy400).text(
      `${who ? `Prepared for ${who}  ·  ` : ''}Generated ${asDate(report.generated_at || new Date())}`,
      PAGE.left,
      92,
    );
    doc.y = 140;

    // ── Overview score cards ──
    sectionTitle(doc, 'Week overview');
    const cardW = 235;
    const cardH = 58;
    const cardY = doc.y;
    const drawScoreCard = (x, title, score, trend, accent) => {
      doc.roundedRect(x, cardY, cardW, cardH, 8).fill(BRAND.navy50);
      doc.roundedRect(x, cardY, 4, cardH, 2).fill(accent);
      doc.fillColor(BRAND.navy500).fontSize(8).text(title.toUpperCase(), x + 14, cardY + 10, { width: cardW - 24 });
      doc.fillColor(BRAND.navy900).fontSize(20).text(`${scoreDisplay(score)}`, x + 14, cardY + 24);
      doc.fillColor(BRAND.navy400).fontSize(8).text('/ 100', x + 52, cardY + 32);
      if (trend) {
        doc.fillColor(BRAND.navy500).fontSize(8).text(`Trend: ${lineText(trend)}`, x + 14, cardY + 44, {
          width: cardW - 24,
        });
      }
    };
    drawScoreCard(PAGE.left, 'Health score', metrics.health_score, metrics.mood_trend, BRAND.emerald500);
    drawScoreCard(PAGE.left + cardW + 20, 'Finance score', metrics.financial_health_score, metrics.spending_trend, BRAND.amber500);
    doc.y = cardY + cardH + 14;

    // Week totals strip from daily logs (facts)
    if (daily?.totals) {
      ensureSpace(doc, 48);
      const t = daily.totals;
      const facts = [
        t.steps != null ? `Steps ${t.steps.toLocaleString('en-US')}` : null,
        t.sleep_h_avg != null ? `Sleep avg ${t.sleep_h_avg}h` : null,
        t.mood_avg != null ? `Mood avg ${t.mood_avg}/10` : null,
        t.water != null ? `Water ${t.water}` : null,
        t.exercise_min != null ? `Exercise ${t.exercise_min} min` : null,
        `Income ${t.income ?? 0}`,
        `Expense ${t.expense ?? 0}`,
        `${daily.days_with_data || 0}/7 days logged`,
      ].filter(Boolean);
      const stripY = doc.y;
      doc.roundedRect(PAGE.left, stripY, PAGE.width, 36, 8).fill(BRAND.emerald50);
      doc.fillColor(BRAND.emerald600).fontSize(8).text('LOGGED THIS WEEK', PAGE.left + 12, stripY + 8);
      doc.fillColor(BRAND.navy800).fontSize(9).text(facts.join('   ·   '), PAGE.left + 12, stripY + 20, {
        width: PAGE.width - 24,
      });
      doc.y = stripY + 48;
    }

    // Narrative summary
    sectionTitle(doc, 'Summary');
    doc.fontSize(10).fillColor(BRAND.body).text(frozen.summary, PAGE.left, doc.y, {
      width: PAGE.width,
      align: 'left',
      lineGap: 3,
    });
    doc.moveDown(0.5);

    // Budget
    if (metrics.budget) {
      sectionTitle(doc, 'Budget snapshot');
      doc.fontSize(10).fillColor(BRAND.body);
      Object.entries(metrics.budget).forEach(([k, v]) => {
        const label = k.replace(/_/g, ' ');
        const rendered = lineText(v);
        if (rendered === MISSING) return;
        const isExpense = /expense/i.test(k);
        const isIncome = /income/i.test(k);
        doc.fillColor(isExpense ? BRAND.coral500 : isIncome ? BRAND.emerald600 : BRAND.body);
        doc.text(`${label}: ${rendered}`, { width: PAGE.width });
        doc.fillColor(BRAND.body);
      });
      doc.moveDown(0.3);
    }

    // ── Daily overview (every day of the week) ──
    sectionTitle(doc, 'Daily overview');
    doc.fontSize(9).fillColor(BRAND.navy500).text(
      'Fact-based from your health and finance logs for each day of this ISO week (UTC).',
      PAGE.left,
      doc.y,
      { width: PAGE.width },
    );
    doc.moveDown(0.4);

    const days = Array.isArray(daily?.days) ? daily.days : [];
    if (!days.length) {
      doc.fontSize(10).fillColor(BRAND.navy400).text(
        'No daily log data was frozen for this report. Log health and spending, then generate a new weekly report.',
        { width: PAGE.width },
      );
      doc.moveDown(0.4);
    } else {
      days.forEach((day) => {
        ensureSpace(doc, 86);
        const y0 = doc.y;
        const cardH = 78;
        const hasData = (day.health_count || 0) + (day.finance_count || 0) > 0;
        doc.roundedRect(PAGE.left, y0, PAGE.width, cardH, 8).fill(hasData ? BRAND.surface : BRAND.navy50);
        doc.roundedRect(PAGE.left, y0, 4, cardH, 2).fill(hasData ? BRAND.emerald500 : BRAND.navy200);

        doc.fillColor(BRAND.navy900).fontSize(11).text(
          `${day.weekday}  ${day.date}`,
          PAGE.left + 14,
          y0 + 8,
          { width: 160 },
        );
        doc.fontSize(8).fillColor(BRAND.coral500).text(
          day.expense > 0 ? `-${day.expense}` : 'exp 0',
          PAGE.left + 340,
          y0 + 10,
          { width: 70, align: 'right' },
        );
        doc.fillColor(BRAND.emerald600).text(
          day.income > 0 ? `+${day.income}` : 'inc 0',
          PAGE.left + 415,
          y0 + 10,
          { width: 70, align: 'right' },
        );

        // Headline (richest single takeaway)
        doc.fillColor(BRAND.emerald600).fontSize(9).text(dayHeadline(day), PAGE.left + 14, y0 + 24, {
          width: PAGE.width - 28,
          ellipsis: true,
        });

        // Metric row
        const cells = [
          { label: 'Steps', val: day.steps != null ? String(day.steps) : MISSING },
          { label: 'Sleep', val: day.sleep_h != null ? `${day.sleep_h}h` : MISSING },
          { label: 'Mood', val: day.mood != null ? `${day.mood}` : MISSING },
          { label: 'Water', val: day.water != null ? String(day.water) : MISSING },
          { label: 'Move', val: day.exercise_min != null ? `${day.exercise_min}m` : MISSING },
        ];
        let cx = PAGE.left + 14;
        cells.forEach((c) => {
          doc.fillColor(BRAND.navy400).fontSize(7).text(c.label.toUpperCase(), cx, y0 + 40, { width: 70 });
          doc.fillColor(BRAND.navy800).fontSize(10).text(c.val, cx, y0 + 50, { width: 70 });
          cx += 78;
        });

        doc.fillColor(BRAND.navy500).fontSize(7).text(dayHighlights(day), PAGE.left + 14, y0 + 64, {
          width: PAGE.width - 28,
          ellipsis: true,
        });
        doc.y = y0 + cardH + 8;
      });
    }

    // Patterns
    if (patterns.length) {
      sectionTitle(doc, 'Patterns');
      doc.fontSize(10).fillColor(BRAND.body);
      patterns.forEach((p, i) => {
        const t = lineText(p);
        if (t === MISSING) return;
        ensureSpace(doc, 24);
        doc.fillColor(BRAND.emerald600).text(`${i + 1}.`, PAGE.left, doc.y, { continued: true, width: 18 });
        doc.fillColor(BRAND.body).text(` ${t}`, { width: PAGE.width - 18 });
        doc.moveDown(0.15);
      });
    }

    // Recommendations
    if (recs.length) {
      sectionTitle(doc, 'Recommendations');
      doc.fontSize(10);
      recs.forEach((r, i) => {
        const t = lineText(r.text || r);
        if (t === MISSING) return;
        ensureSpace(doc, 24);
        const priority = r.priority ? ` [${r.priority}]` : '';
        doc.fillColor(BRAND.navy900).text(`${i + 1}. ${t}${priority}`, PAGE.left, doc.y, {
          width: PAGE.width,
        });
        doc.moveDown(0.15);
      });
    }

    // Cross-domain
    if (metrics.cross_domain) {
      sectionTitle(doc, 'Cross-domain notes');
      doc.fontSize(10).fillColor(BRAND.body).text(lineText(metrics.cross_domain), {
        width: PAGE.width,
        lineGap: 2,
      });
    }

    // Footer disclaimer
    ensureSpace(doc, 50);
    doc.moveDown(0.8);
    doc.moveTo(PAGE.left, doc.y).lineTo(PAGE.right, doc.y).strokeColor(BRAND.navy100).stroke();
    doc.moveDown(0.4);
    doc.fontSize(8).fillColor(BRAND.navy400).text(
      'This report is generated from your LifeSync health and finance logs. '
      + 'It is not medical or financial advice. Scores are deterministic dashboard metrics; '
      + 'narrative text may include model-assisted wording labeled in product UI. '
      + 'Daily overview uses UTC calendar days for the ISO week shown above.',
      PAGE.left,
      doc.y,
      { width: PAGE.width, align: 'left' },
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
  BRAND,
};
