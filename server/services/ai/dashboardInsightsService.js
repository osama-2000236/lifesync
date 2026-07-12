const AISummary = require('../../models/AISummary');
const { runInsightEngine } = require('./insightEngine');
const { generateWeeklyInsights } = require('./nlpService');
const { weekBoundsUtc } = require('../../utils/isoWeek');

const cache = new Map();
/** Prevent unbounded growth if many users hit a single process. */
const MAX_CACHE_ENTRIES = 500;

const cacheTtlMs = () => parseInt(process.env.AI_INSIGHTS_CACHE_TTL_MS, 10) || 15 * 60 * 1000;
const fallbackTtlMs = () => Math.min(cacheTtlMs(), 60 * 1000);

/** Client-safe model_runtime — never forward raw errors/keys from providers. */
const sanitizeModelRuntime = (rt = {}) => {
  if (!rt || typeof rt !== 'object') return { status: 'unknown' };
  return {
    status: rt.status || 'unknown',
    provider: rt.provider || null,
    model: rt.model || null,
    operating_mode: rt.operating_mode || null,
    cache_ttl_ms: rt.cache_ttl_ms != null ? rt.cache_ttl_ms : undefined,
    generated_at: rt.generated_at || undefined,
  };
};

const compactDeterministicInput = (insights) => ({
  period: insights.period,
  health_score: insights.health_score,
  financial_health_score: insights.financial_health_score,
  mood_trend: insights.mood_trend,
  spending_trend: insights.spending_trend,
  budget_summary: insights.budget_summary,
  detected_patterns: insights.patterns,
  deterministic_recommendations: insights.recommendations,
});

const mergeRecommendations = (modelRecommendations = [], deterministicRecommendations = []) => {
  const seen = new Set();
  return [...modelRecommendations, ...deterministicRecommendations]
    .filter((item) => item && item.text)
    .filter((item) => {
      const key = item.text.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
};

const buildDashboardInsights = async (userId, { force = false, at = new Date() } = {}) => {
  // Cache per user + ISO week so Mon roll-over cannot serve last week’s scores.
  const cacheKey = `${userId}:${weekBoundsUtc(at).week_key}`;
  const cached = cache.get(cacheKey);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;

  const deterministic = await runInsightEngine(userId, { at });
  const modelInsights = await generateWeeklyInsights(
    { deterministic_metrics: compactDeterministicInput(deterministic) },
    { instruction: 'Use the deterministic metrics as facts. Do not recalculate or invent scores.' }
  );
  const modelReady = modelInsights?._model_runtime?.status === 'ready';
  const classifierOnly = modelInsights?._model_runtime?.status === 'classifier_only';

  const result = {
    ...deterministic,
    summary: modelReady && modelInsights.summary ? modelInsights.summary : deterministic.summary,
    recommendations: modelReady
      ? mergeRecommendations(modelInsights.recommendations, deterministic.recommendations)
      : deterministic.recommendations,
    cross_domain_insights: modelReady && modelInsights.cross_domain_insights
      ? modelInsights.cross_domain_insights
      : deterministic.cross_domain_insights,
    model_runtime: sanitizeModelRuntime({
      ...(modelInsights?._model_runtime || { status: 'fallback' }),
      operating_mode: modelReady
        ? 'local_model_narrative_with_deterministic_metrics'
        : classifierOnly
          ? 'bert_classifier_with_deterministic_dashboard'
          : 'deterministic_fallback',
      cache_ttl_ms: cacheTtlMs(),
      generated_at: new Date().toISOString(),
    }),
  };

  // Evict expired + oldest if over cap (simple FIFO via Map insertion order).
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expiresAt <= now) cache.delete(k);
    }
    while (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }

  cache.set(cacheKey, {
    value: result,
    expiresAt: Date.now() + ((modelReady || classifierOnly) ? cacheTtlMs() : fallbackTtlMs()),
  });
  return result;
};

const persistDashboardInsights = async (userId, { at = new Date() } = {}) => {
  const insights = await buildDashboardInsights(userId, { force: true, at });
  const summary = await AISummary.create({
    user_id: userId,
    type: 'combined',
    period_start: insights.period.start.toISOString().split('T')[0],
    period_end: insights.period.end.toISOString().split('T')[0],
    summary: insights.summary,
    patterns: insights.patterns,
    recommendations: insights.recommendations,
    metrics_snapshot: {
      health_score: insights.health_score,
      financial_health_score: insights.financial_health_score,
      mood_trend: insights.mood_trend,
      spending_trend: insights.spending_trend,
      cross_domain: insights.cross_domain_insights,
      budget: insights.budget_summary,
      model_runtime: insights.model_runtime,
    },
    is_read: false,
    generated_at: new Date(),
  });

  return { ...insights, id: summary.id };
};

module.exports = {
  buildDashboardInsights,
  persistDashboardInsights,
  _clearCache: () => cache.clear(),
  _sanitizeModelRuntime: sanitizeModelRuntime,
};
