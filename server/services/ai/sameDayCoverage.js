// sameDayCoverage.js
// ============================================
// Same-calendar-day (UTC) log coverage — code-enforced "do not re-ask".
// Used by Track B digger (chat + voice) and side interview suggestions.
// ============================================

const startOfUtcDay = (d = new Date()) => {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
};

const MS_DAY = 24 * 60 * 60 * 1000;

const isSameUtcDay = (loggedAt, now = new Date()) => {
  if (loggedAt == null || loggedAt === '') return false;
  const t = new Date(loggedAt).getTime();
  if (!Number.isFinite(t)) return false;
  // Half-open [start, start+1d) — not just "after midnight" (that treats tomorrow as today).
  const start = startOfUtcDay(now).getTime();
  return t >= start && t < start + MS_DAY;
};

/**
 * @returns {{ health: Set<string>, finance: Set<string> }}
 */
const emptyCoverage = () => ({ health: new Set(), finance: new Set() });

/**
 * Build coverage from context recent rows + optional this-turn entities
 * (entities logged this request may not yet appear in recent_*).
 */
const coverageFromContext = (context = {}, now = new Date()) => {
  const health = new Set();
  const finance = new Set();
  for (const r of context.recent_health_entries || []) {
    if (r?.type && isSameUtcDay(r.logged_at, now)) health.add(String(r.type));
  }
  for (const r of context.recent_finance_entries || []) {
    if (r?.type && isSameUtcDay(r.logged_at, now)) finance.add(String(r.type));
  }
  for (const e of context.this_turn_entities || []) {
    if (!e?.type) continue;
    if (e.domain === 'health') health.add(String(e.type));
    if (e.domain === 'finance') finance.add(String(e.type));
  }
  return { health, finance };
};

/** Human labels for prompt LOGGED_TODAY line. */
const formatCoverageLine = (coverage) => {
  const h = [...(coverage.health || [])].sort();
  const f = [...(coverage.finance || [])].sort();
  if (!h.length && !f.length) return '';
  const parts = [];
  if (h.length) parts.push(`health: ${h.join(', ')}`);
  if (f.length) parts.push(`finance: ${f.join(', ')}`);
  return parts.join('; ');
};

module.exports = {
  startOfUtcDay,
  isSameUtcDay,
  emptyCoverage,
  coverageFromContext,
  formatCoverageLine,
};
