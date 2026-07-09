// server/services/ai/insightLocalizer.js
// ============================================
// Arabic localization for Insight Engine output.
// RULES and category map live in insightTemplates.js (single source of truth).
// ============================================

const { RULES } = require('./insightTemplates');

/** Translate one engine-produced string to Arabic. Unknown parts stay English. */
const localizeInsightText = (text) => {
  if (!text) return text;
  let out = String(text);
  for (const [re, replacer] of RULES) out = out.replace(re, replacer);
  return out;
};

/**
 * Attach `_ar` fields to a full insight payload (additive, never mutates the
 * English fields): summary_ar, cross_domain_insights_ar, and per-recommendation
 * text_ar / reason_ar.
 */
const localizeInsights = (insights) => {
  if (!insights || typeof insights !== 'object') return insights;
  return {
    ...insights,
    summary_ar: localizeInsightText(insights.summary),
    cross_domain_insights_ar: localizeInsightText(insights.cross_domain_insights),
    recommendations: (insights.recommendations || []).map((r) => ({
      ...r,
      text_ar: localizeInsightText(r.text),
      reason_ar: localizeInsightText(r.reason),
    })),
  };
};

module.exports = { localizeInsightText, localizeInsights };
