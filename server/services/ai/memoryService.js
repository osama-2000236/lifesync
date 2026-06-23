// server/services/ai/memoryService.js
// ============================================
// User Memory Service
// ============================================
// Deterministic, model-agnostic extraction of durable facts the assistant
// should remember about a user (name, vehicle, commute routine, food/coffee
// preferences, occupation, dietary notes, budget). Facts are upserted into the
// `user_memories` table and injected into the model context so every model —
// BERT, Gemma, or a custom one — answers as a daily assistant that remembers
// the person, and so memory transfers automatically when the model changes.
//
// Design: rule-based, conservative (high precision), and resilient — it never
// throws into the chat pipeline. This matches the project's deterministic
// hybrid-router philosophy (BERT is a classifier, not a generator).
// ============================================

const UserMemory = require('../../models/UserMemory');

const clean = (text) => String(text || '').replace(/\s+/g, ' ').trim();
const titleCase = (value) => clean(value).replace(/\b\w/g, (c) => c.toUpperCase());
const lower = (text) => clean(text).toLowerCase();

// Probe the table once so a not-yet-migrated DB degrades quietly.
let _tableReady = null;
const isTableReady = async () => {
  if (_tableReady !== null) return _tableReady;
  try {
    await UserMemory.describe();
    _tableReady = true;
  } catch {
    _tableReady = false;
  }
  return _tableReady;
};

// ─── Extraction rules ───────────────────────────────────────────────
// Each rule returns one or more candidates: { mem_key, category, value,
// confidence, salience }. Keep patterns specific to avoid false memories.

const NAME_PATTERNS = [
  /\bmy name is\s+([a-z][a-z' -]{1,40})/i,
  /\b(?:i am|i'm)\s+([A-Z][a-z]{2,20})\b(?!\s+(?:feeling|going|happy|sad|tired|at|in|on|a|an|the|so|very|really|not|good|bad|ok|okay|fine|great))/,
  /\bcall me\s+([a-z][a-z' -]{1,30})/i,
];

const OCCUPATION_PATTERNS = [
  /\bi (?:work as|am)\s+(?:an?\s+)?([a-z][a-z /-]{2,40}?)(?:\.|,|;|$| at | in | for )/i,
  /\bi'm\s+(?:an?\s+)?([a-z][a-z /-]{2,40}?)\s+(?:by profession|at work)/i,
  /\bi study\s+([a-z][a-z /-]{2,40})/i,
];

const VEHICLE_RULES = [
  { test: /\bi (?:have|own|drive|got)\s+a\s+car\b|\bby car\b|\bmy car\b/i, value: 'has a car (often travels by car)', key: 'vehicle.car', salience: 3 },
  { test: /\bi (?:have|own|ride|got)\s+a\s+(?:bike|bicycle)\b|\bby bike\b|\bmy (?:bike|bicycle)\b/i, value: 'has a bicycle', key: 'vehicle.bike', salience: 2 },
  { test: /\bi (?:have|own|ride|got)\s+a\s+(?:motorbike|motorcycle|scooter)\b/i, value: 'has a motorbike/scooter', key: 'vehicle.motorbike', salience: 2 },
  { test: /\b(?:i (?:don'?t|do not) (?:have|own) a car|i have no car|no car)\b/i, value: 'does not have a car (walks / public transport)', key: 'vehicle.none', salience: 3 },
  { test: /\bi (?:take|use|ride)\s+the\s+(?:bus|train|metro|tram)\b|\bby (?:bus|train|metro)\b/i, value: 'uses public transport (bus/train)', key: 'transport.public', salience: 2 },
];

const DIET_RULES = [
  { test: /\bi'?m\s+(?:a\s+)?vegetarian\b/i, value: 'vegetarian', key: 'diet.vegetarian' },
  { test: /\bi'?m\s+(?:a\s+)?vegan\b/i, value: 'vegan', key: 'diet.vegan' },
  { test: /\bi (?:am|'m)\s+allergic to\s+([a-z][a-z, /-]{2,40})/i, value: null, key: 'diet.allergy', capture: true, prefix: 'allergic to ' },
  { test: /\bi (?:don'?t|do not) (?:eat|drink)\s+([a-z][a-z, /-]{2,30})/i, value: null, key: 'diet.avoids', capture: true, prefix: 'avoids ' },
  { test: /\bi (?:love|like|enjoy|prefer)\s+(coffee|tea|chocolate|pizza|running|the gym|cycling|swimming|reading)\b/i, value: null, key: null, capture: true, prefix: 'enjoys ', dynamicKey: 'pref.' },
];

const ROUTINE_RULES = [
  { test: /\bevery (?:morning|day)\b[^.!?]*?\b(walk|run|jog|gym|workout|coffee)\b/i, key: 'routine.daily', salienceBonus: 1 },
  { test: /\bi usually\b[^.!?]{3,60}/i, key: 'routine.usual' },
];

const LOCATION_PATTERNS = [
  /\bi live in\s+([a-z][a-z' -]{2,40})/i,
  /\bi'?m (?:from|based in)\s+([a-z][a-z' -]{2,40})/i,
];

const BUDGET_PATTERN = /\bmy (?:monthly )?budget is\s*([$€£₪]?\s*\d[\d,]*(?:\.\d+)?)/i;
const SAVE_GOAL_PATTERN = /\bi want to save\s*([$€£₪]?\s*\d[\d,]*(?:\.\d+)?)?/i;

/**
 * Extract durable memory candidates from a single user message.
 * Conservative on purpose: only stores facts stated about the user.
 * @returns {Array<{mem_key,category,value,confidence,salience}>}
 */
const extractMemoryCandidates = (message) => {
  const text = clean(message);
  if (!text) return [];
  const out = [];
  const push = (mem_key, category, value, confidence = 0.7, salience = 1) => {
    if (!mem_key || !value) return;
    out.push({ mem_key, category, value: clean(value).slice(0, 240), confidence, salience });
  };

  // Name
  for (const pattern of NAME_PATTERNS) {
    const m = text.match(pattern);
    if (m && m[1]) {
      const name = titleCase(m[1].split(' ')[0]);
      if (name.length >= 2) { push('name', 'profile', name, 0.9, 5); break; }
    }
  }

  // Occupation / study
  for (const pattern of OCCUPATION_PATTERNS) {
    const m = text.match(pattern);
    if (m && m[1] && m[1].length >= 3) {
      push('occupation', 'profile', clean(m[1]), 0.75, 3);
      break;
    }
  }

  // Location
  for (const pattern of LOCATION_PATTERNS) {
    const m = text.match(pattern);
    if (m && m[1]) { push('location.home', 'profile', titleCase(m[1]), 0.8, 2); break; }
  }

  // Vehicle / transport
  for (const rule of VEHICLE_RULES) {
    if (rule.test.test(text)) push(rule.key, 'routine', rule.value, 0.85, rule.salience || 2);
  }

  // Diet & preferences
  for (const rule of DIET_RULES) {
    const m = text.match(rule.test);
    if (!m) continue;
    if (rule.capture && m[1]) {
      const captured = lower(m[1]).replace(/[.,;].*$/, '').trim();
      if (!captured) continue;
      const key = rule.dynamicKey ? `${rule.dynamicKey}${captured.split(' ')[0]}` : rule.key;
      push(key, 'preference', `${rule.prefix || ''}${captured}`, 0.7, 2);
    } else if (rule.value) {
      push(rule.key, 'preference', rule.value, 0.8, 2);
    }
  }

  // Routines
  for (const rule of ROUTINE_RULES) {
    const m = text.match(rule.test);
    if (m) push(rule.key, 'routine', clean(m[0]).slice(0, 160), 0.6, 1 + (rule.salienceBonus || 0));
  }

  // Budget / savings goal
  const budget = text.match(BUDGET_PATTERN);
  if (budget && budget[1]) push('finance.budget', 'finance', `monthly budget around ${clean(budget[1])}`, 0.8, 3);
  const save = text.match(SAVE_GOAL_PATTERN);
  if (save) push('finance.save_goal', 'goal', save[1] ? `wants to save ${clean(save[1])}` : 'wants to build savings', 0.7, 2);

  return out;
};

/**
 * Upsert candidate facts for a user. Reinforces existing facts
 * (times_seen / salience / last_seen_at) instead of duplicating.
 */
const recordMemories = async (userId, candidates) => {
  if (!userId || !Array.isArray(candidates) || candidates.length === 0) return [];
  if (!(await isTableReady())) return [];
  const saved = [];
  for (const cand of candidates) {
    try {
      const existing = await UserMemory.findOne({ where: { user_id: userId, mem_key: cand.mem_key } });
      if (existing) {
        await existing.update({
          value: cand.value,
          confidence: Math.max(Number(existing.confidence) || 0, cand.confidence),
          salience: (existing.salience || 1) + 1,
          times_seen: (existing.times_seen || 1) + 1,
          last_seen_at: new Date(),
        });
        saved.push(existing);
      } else {
        const created = await UserMemory.create({
          user_id: userId,
          mem_key: cand.mem_key,
          category: cand.category || 'other',
          value: cand.value,
          confidence: cand.confidence ?? 0.7,
          source: 'chat',
          salience: cand.salience || 1,
          times_seen: 1,
          last_seen_at: new Date(),
        });
        saved.push(created);
      }
    } catch {
      // Never let memory writes break a chat turn.
    }
  }
  return saved;
};

/**
 * Extract + persist memory from one chat turn. Safe to await or fire-and-forget.
 * `nlpResult._memory_writes` lets the assistant store facts it resolved this
 * turn (e.g. the commute mode after a cross-domain follow-up).
 */
const recordTurnMemories = async (userId, message, nlpResult = null) => {
  try {
    const candidates = extractMemoryCandidates(message);
    const explicit = Array.isArray(nlpResult?._memory_writes) ? nlpResult._memory_writes : [];
    const all = [...candidates, ...explicit];
    if (all.length === 0) return [];
    return await recordMemories(userId, all);
  } catch {
    return [];
  }
};

/** Directly store/refresh a single fact (used by routine resolution, system writes). */
const rememberFact = async (userId, mem_key, value, { category = 'routine', confidence = 0.85, salience = 3 } = {}) => {
  return recordMemories(userId, [{ mem_key, category, value, confidence, salience }]);
};

/** Top memories for context injection, highest salience first. */
const getMemories = async (userId, { limit = 12 } = {}) => {
  if (!userId || !(await isTableReady())) return [];
  try {
    const rows = await UserMemory.findAll({
      where: { user_id: userId },
      order: [['salience', 'DESC'], ['times_seen', 'DESC'], ['last_seen_at', 'DESC']],
      limit,
      attributes: ['mem_key', 'category', 'value', 'confidence', 'salience', 'last_seen_at'],
    });
    return rows.map((r) => (r.get ? r.get({ plain: true }) : r));
  } catch {
    return [];
  }
};

/** One-line natural summary of what the assistant remembers (for prose replies). */
const summarizeMemories = (memories) => {
  if (!Array.isArray(memories) || memories.length === 0) return '';
  const parts = memories.slice(0, 5).map((m) => m.value).filter(Boolean);
  if (parts.length === 0) return '';
  return parts.join('; ');
};

/** Memory block for the model context object. */
const buildMemoryContext = async (userId) => {
  const memories = await getMemories(userId, { limit: 12 });
  return {
    items: memories.map((m) => ({ key: m.mem_key, category: m.category, value: m.value })),
    summary: summarizeMemories(memories),
    count: memories.length,
  };
};

module.exports = {
  extractMemoryCandidates,
  recordMemories,
  recordTurnMemories,
  rememberFact,
  getMemories,
  summarizeMemories,
  buildMemoryContext,
  _resetTableProbe: () => { _tableReady = null; },
};
