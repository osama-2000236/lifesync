/**
 * Line-by-line verification harness for weekly PDF report content.
 * Uses real insightEngine pattern/rec shapes (observation not text).
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { buildWeeklyReportPdf, lineText, asDate } = require('../server/services/pdfReportBuilder');
const { isoWeekKey, weekBoundsUtc } = require('../server/services/reportService');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'output');
fs.mkdirSync(outDir, { recursive: true });

// Real shapes from insightEngine.js patterns.map / recommendations
const realPatterns = [
  {
    observation: 'Sleep and spending move together (r=0.6).',
    domain: 'cross',
    trend: 'negative',
    severity: 'informative',
  },
  {
    observation: 'Better mood days tend to include more home meals.',
    domain: 'health',
    trend: 'stable',
    severity: 'informative',
  },
];
const realRecs = [
  { text: 'Sleep 7h+', priority: 'high', reason: 'Sleep spend link', domain: 'health' },
  { text: 'Walk 30 minutes', priority: 'medium', domain: 'health' },
];
const realBudget = {
  income: 500,
  expenses: 120.5,
  savings_rate: 76,
  top_categories: [{ category: 'Food', percentage: 40 }],
  monthly_projected: 482,
};

console.log('=== lineText unit checks (production shapes) ===');
const checks = [
  ['null', lineText(null), '—'],
  ['number', lineText(72), '72'],
  ['string', lineText('stable'), 'stable'],
  ['rec with text', lineText(realRecs[0]), 'Sleep 7h+'],
  ['pattern observation-only', lineText(realPatterns[0]), JSON.stringify(realPatterns[0])],
  ['array of patterns', lineText(realPatterns).includes('"observation"') ? 'JSON_DUMP' : 'ok', 'JSON_DUMP'],
];
for (const [name, got, expected] of checks) {
  const pass = got === expected || (expected === 'JSON_DUMP' && got === 'JSON_DUMP');
  console.log(pass ? 'PASS' : 'FAIL', name, '=>', typeof got === 'string' && got.length > 80 ? got.slice(0, 80) + '…' : got);
}

console.log('\n=== period alignment ===');
const at = new Date('2026-07-11T12:00:00Z');
const bounds = weekBoundsUtc(at);
const rollingStart = new Date(at);
rollingStart.setUTCDate(rollingStart.getUTCDate() - 7);
console.log('ISO week_key:', isoWeekKey(at));
console.log('ISO Mon–Sun:', bounds.period_start, '→', bounds.period_end);
console.log('Rolling ~7d:', rollingStart.toISOString().slice(0, 10), '→', at.toISOString().slice(0, 10));
console.log(
  'Mismatch if insights.period used for period_* while week_key is ISO:',
  bounds.period_start !== rollingStart.toISOString().slice(0, 10) ? 'YES (dates differ)' : 'no (same day)',
);

console.log('\n=== asDate ===');
console.log('Date:', asDate(new Date('2026-07-12T15:30:00Z')));
console.log('string:', asDate('2026-07-12T00:00:00.000Z'));
console.log('null:', asDate(null));

const report = {
  week_key: bounds.week_key,
  // Simulate freeze from insights.period (rolling) under ISO week_key
  period_start: rollingStart.toISOString().slice(0, 10),
  period_end: at.toISOString().slice(0, 10),
  summary: 'You slept well and spent carefully this week.',
  metrics_snapshot: {
    health_score: 72,
    financial_health_score: 65,
    mood_trend: 'stable',
    spending_trend: 'down',
    budget: realBudget,
    cross_domain: realPatterns[0].observation,
    model_runtime: { status: 'classifier_only' },
  },
  recommendations: realRecs,
  patterns: realPatterns,
  user_name: 'QA Bot',
  user_email: 'qa@test.com',
  generated_at: new Date('2026-07-12T12:00:00Z'),
};

// Expected human-readable lines that MUST appear if builder is correct
const expectedLines = [
  'LifeSync Weekly Report',
  `Week ${report.week_key}`,
  'Scores',
  'Health score: 72 / 100',
  'Financial health score: 65 / 100',
  'Mood trend: stable',
  'Spending trend: down',
  'Budget snapshot',
  'income: 500',
  'expenses: 120.5',
  'Summary',
  'You slept well and spent carefully this week.',
  'Patterns',
  'Recommendations',
  '1. Sleep 7h+ [high]',
  '2. Walk 30 minutes',
  'Cross-domain notes',
  'Sleep and spending move together',
  'not medical or financial advice',
];

// Defect signals
const defectSignals = {
  patternJsonDump: false,
  missingHumanObservation: false,
  periodLabelMismatch: report.period_start !== bounds.period_start,
};

const pdf = await buildWeeklyReportPdf(report);
const outPath = path.join(outDir, 'qa-weekly-report-sample.pdf');
fs.writeFileSync(outPath, pdf);

// pdfkit embeds text as (string) Tj mostly with WinAnsi
const raw = pdf.toString('binary');
const tjStrings = [];
const re = /\(((?:\\.|[^\\)])*)\)\s*Tj/g;
let m;
while ((m = re.exec(raw))) {
  const decoded = m[1]
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
  tjStrings.push(decoded);
}

// Also TJ arrays
const reTJ = /\[((?:[^\]]|\\.)*)\]\s*TJ/g;
while ((m = reTJ.exec(raw))) {
  const parts = [...m[1].matchAll(/\(((?:\\.|[^\\)])*)\)/g)].map((x) =>
    x[1]
      .replace(/\\n/g, '\n')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\'),
  );
  if (parts.length) tjStrings.push(parts.join(''));
}

const joined = tjStrings.join('\n');
console.log('\n=== PDF extracted text lines (' + tjStrings.length + ' chunks) ===');
tjStrings.forEach((t, i) => console.log(String(i + 1).padStart(3), JSON.stringify(t)));

console.log('\n=== Expected line presence ===');
for (const line of expectedLines) {
  const ok = joined.includes(line) || raw.includes(line);
  console.log(ok ? 'PASS' : 'MISS', line);
}

// Pattern rendering defect
defectSignals.patternJsonDump = joined.includes('"observation"') || joined.includes('observation');
// Check if human observation of pattern #1 appears as numbered item text alone
const patternLine1 = joined.match(/1\.\s*([^\n]+)/);
console.log('\n=== Pattern line #1 render ===', patternLine1 ? patternLine1[0].slice(0, 120) : '(not found)');
if (patternLine1 && patternLine1[0].includes('{')) {
  defectSignals.patternJsonDump = true;
}
if (!joined.includes('Sleep and spending move together') && !joined.includes('Better mood')) {
  // might only appear in cross-domain; patterns section broken
  defectSignals.missingHumanObservation = true;
}

console.log('\n=== DEFECT SIGNALS ===');
console.log(JSON.stringify(defectSignals, null, 2));
console.log('PDF bytes:', pdf.length, 'header:', pdf.slice(0, 5).toString());
console.log('Wrote', outPath);

// Simulate generateWeeklyReport freeze fields
console.log('\n=== Freeze mapping (reportService) ===');
const freeze = {
  week_key: bounds.week_key,
  period_start: report.period_start, // from insights.period if present
  period_end: report.period_end,
  summary: report.summary,
  metrics_snapshot_keys: Object.keys(report.metrics_snapshot),
  recommendations_count: realRecs.length,
  patterns_count: realPatterns.length,
  patterns_have_text: realPatterns.every((p) => p.text),
  patterns_have_observation: realPatterns.every((p) => p.observation),
};
console.log(JSON.stringify(freeze, null, 2));

// lineText fix preview
function lineTextFixed(value) {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    return value.map((v) => lineTextFixed(v)).join('; ');
  }
  if (typeof value === 'object') {
    if (value.text) return String(value.text);
    if (value.observation) return String(value.observation);
    if (value.name) return String(value.name);
    return JSON.stringify(value);
  }
  return String(value);
}
console.log('\n=== Fixed lineText on real pattern ===');
console.log(lineTextFixed(realPatterns[0]));
console.log('rec:', lineTextFixed(realRecs[0]));
console.log('budget top_categories:', lineTextFixed(realBudget.top_categories));
