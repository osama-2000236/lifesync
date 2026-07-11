// Shared guards for chat → HealthLog / FinancialLog writes.
// Used by chatController (stream + JSON + generative-failure paths).

const HEALTH_TYPES = new Set(['steps', 'sleep', 'mood', 'nutrition', 'water', 'exercise', 'heart_rate']);
const FINANCE_TYPES = new Set(['income', 'expense']);
/** Below this confidence we never write health/finance rows (defense in depth). */
const MIN_WRITE_CONFIDENCE = 0.5;

/**
 * Entities allowed to hit the DB. Empty when clarifying or low-confidence —
 * NLP already strips entities on clarification; controller re-enforces.
 */
const entitiesForPersistence = (nlpResult) => {
  if (!nlpResult || nlpResult.needs_clarification) return [];
  if (typeof nlpResult.confidence === 'number' && nlpResult.confidence < MIN_WRITE_CONFIDENCE) {
    return [];
  }
  return Array.isArray(nlpResult.entities) ? nlpResult.entities : [];
};

const isValidHealthEntity = (entity) => {
  if (!entity || entity.domain !== 'health') return false;
  if (!HEALTH_TYPES.has(entity.type)) return false;
  return Number.isFinite(Number(entity.value));
};

const isValidFinanceEntity = (entity) => {
  if (!entity || entity.domain !== 'finance') return false;
  if (!FINANCE_TYPES.has(entity.type)) return false;
  const amount = Number(entity.amount);
  return Number.isFinite(amount) && amount >= 0.01;
};

module.exports = {
  HEALTH_TYPES,
  FINANCE_TYPES,
  MIN_WRITE_CONFIDENCE,
  entitiesForPersistence,
  isValidHealthEntity,
  isValidFinanceEntity,
};
