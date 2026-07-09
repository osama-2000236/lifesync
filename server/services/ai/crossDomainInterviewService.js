// server/services/ai/crossDomainInterviewService.js
// ============================================
// Cross-Domain Interview Service
// ============================================
// Powers the proactive voice assistant: it inspects a user's health + finance
// data, decides whether there is a cross-domain relationship worth probing,
// asks the user for CONSENT, then runs a short structured interview. Every
// answer is logged as a real HealthLog / FinancialLog (+ LinkedDomain) row, so
// the existing dashboard reflects the collected info automatically. Once the
// interview finishes, advice is produced by re-running the existing Insight
// Engine over the now-enriched data — the advice is therefore consistent with
// what the dashboard shows.
//
// Design: the topic/question/answer-mapping logic is deterministic and pure so
// it can be unit-tested to 100%. Only pickTopic / logAnswerEntities / buildAdvice
// touch the database.
// ============================================

const { Op } = require('sequelize');
const HealthLog = require('../../models/HealthLog');
const FinancialLog = require('../../models/FinancialLog');
const LinkedDomain = require('../../models/LinkedDomain');
const UserMemory = require('../../models/UserMemory');
const { runInsightEngine } = require('./insightEngine');

// ────────────────────────────────────────────
// CONSTANTS
// ────────────────────────────────────────────

const TOPICS = ['sleep_spending', 'mood_nutrition', 'activity_mood', 'budget_savings'];

// A topic is re-offered only after this many days once the user has dismissed it,
// so the assistant never nags on every visit.
const DISMISS_COOLDOWN_DAYS = 7;

const pickLang = (lang) => (lang === 'ar' ? 'ar' : 'en');
// Every QUESTION_BANK field defines both en + ar, and callers guard invalid
// topics, so a direct lookup is safe (pickLang always normalizes to en|ar).
const localize = (field, lang) => field[pickLang(lang)];

// ────────────────────────────────────────────
// QUESTION BANK (bilingual, deterministic)
// ────────────────────────────────────────────
// Each question describes how its answer becomes a health/finance entity via
// `entity`. `input_type` drives the client control (number | choice).
const QUESTION_BANK = {
  sleep_spending: {
    cross_domain: true,
    prompt: {
      en: 'Your sleep and spending look connected. Mind two quick questions so I can give you a useful tip?',
      ar: 'يبدو أن نومك وإنفاقك مرتبطان. هل يمكنني طرح سؤالين سريعين لأعطيك نصيحة مفيدة؟',
    },
    questions: [
      {
        id: 'sleep_hours',
        prompt: { en: 'How many hours did you sleep last night?', ar: 'كم ساعة نمت الليلة الماضية؟' },
        input_type: 'number', min: 0, max: 24,
        entity: { domain: 'health', type: 'sleep', unit: 'hours' },
      },
      {
        id: 'impulse_spend',
        prompt: {
          en: 'Roughly how much did you spend today on takeout, snacks, or spur-of-the-moment buys?',
          ar: 'تقريبًا كم أنفقت اليوم على طلبات الطعام أو الوجبات الخفيفة أو المشتريات العشوائية؟',
        },
        // FinancialLog validates amount >= 0.01 — never accept a zero spend row.
        input_type: 'number', min: 0.01, max: 100000,
        entity: { domain: 'finance', type: 'expense', currency: 'USD', description: 'Impulse / takeout (voice interview)' },
      },
    ],
  },
  mood_nutrition: {
    cross_domain: false,
    prompt: {
      en: 'Mood and food often pull on each other. Can I ask a couple of quick questions?',
      ar: 'غالبًا ما يؤثر المزاج والطعام أحدهما في الآخر. هل يمكنني طرح سؤالين سريعين؟',
    },
    questions: [
      {
        id: 'mood',
        prompt: { en: 'How is your mood today, from 1 to 10?', ar: 'كيف مزاجك اليوم من 1 إلى 10؟' },
        input_type: 'number', min: 1, max: 10,
        entity: { domain: 'health', type: 'mood', unit: 'rating' },
      },
      {
        id: 'water',
        prompt: { en: 'About how many liters of water did you drink today?', ar: 'تقريبًا كم لترًا من الماء شربت اليوم؟' },
        input_type: 'number', min: 0, max: 20,
        entity: { domain: 'health', type: 'water', unit: 'liters' },
      },
      {
        id: 'meal_quality',
        prompt: { en: 'How healthy were your meals today?', ar: 'كيف كانت وجباتك اليوم؟' },
        input_type: 'choice',
        options: [
          { value: 'healthy', label: { en: 'Mostly healthy', ar: 'صحية في الغالب' }, score: 3 },
          { value: 'mixed', label: { en: 'A mix', ar: 'مختلطة' }, score: 2 },
          { value: 'junk', label: { en: 'Mostly junk', ar: 'غير صحية في الغالب' }, score: 1 },
        ],
        entity: { domain: 'health', type: 'nutrition', unit: 'rating' },
      },
    ],
  },
  activity_mood: {
    cross_domain: false,
    prompt: {
      en: 'A little movement often lifts mood. Two quick questions about your day?',
      ar: 'القليل من الحركة غالبًا يرفع المزاج. سؤالان سريعان عن يومك؟',
    },
    questions: [
      {
        id: 'exercise_minutes',
        prompt: { en: 'How many minutes did you exercise today?', ar: 'كم دقيقة تحركت أو تمرّنت اليوم؟' },
        input_type: 'number', min: 0, max: 1000,
        entity: { domain: 'health', type: 'exercise', unit: 'minutes' },
      },
      {
        id: 'mood',
        prompt: { en: 'And your mood today, from 1 to 10?', ar: 'ومزاجك اليوم من 1 إلى 10؟' },
        input_type: 'number', min: 1, max: 10,
        entity: { domain: 'health', type: 'mood', unit: 'rating' },
      },
    ],
  },
  budget_savings: {
    cross_domain: false,
    prompt: {
      en: 'Want a clearer picture of this week\'s money? Two quick numbers.',
      ar: 'هل تريد صورة أوضح عن مالك هذا الأسبوع؟ رقمان فقط.',
    },
    questions: [
      {
        id: 'income',
        prompt: { en: 'About how much income did you get this week?', ar: 'تقريبًا كم دخلك هذا الأسبوع؟' },
        input_type: 'number', min: 0.01, max: 10000000,
        entity: { domain: 'finance', type: 'income', currency: 'USD', description: 'Weekly income (voice interview)' },
      },
      {
        id: 'expense',
        prompt: { en: 'And about how much did you spend this week?', ar: 'وكم أنفقت تقريبًا هذا الأسبوع؟' },
        input_type: 'number', min: 0.01, max: 10000000,
        entity: { domain: 'finance', type: 'expense', currency: 'USD', description: 'Weekly expense (voice interview)' },
      },
    ],
  },
};

// ────────────────────────────────────────────
// PURE HELPERS (fully unit-testable)
// ────────────────────────────────────────────

const isValidTopic = (topic) => Object.prototype.hasOwnProperty.call(QUESTION_BANK, topic);

const totalSteps = (topic) => (isValidTopic(topic) ? QUESTION_BANK[topic].questions.length : 0);

const isCrossDomain = (topic) => Boolean(isValidTopic(topic) && QUESTION_BANK[topic].cross_domain);

const getPrompt = (topic, lang) => (isValidTopic(topic) ? localize(QUESTION_BANK[topic].prompt, lang) : '');

/** Localized question payload for a given 0-based step, or null when finished. */
const nextQuestion = (topic, step, lang) => {
  if (!isValidTopic(topic)) return null;
  const questions = QUESTION_BANK[topic].questions;
  if (step < 0 || step >= questions.length) return null;
  const q = questions[step];
  return {
    id: q.id,
    step,
    total: questions.length,
    prompt: localize(q.prompt, lang),
    input_type: q.input_type,
    min: q.min ?? null,
    max: q.max ?? null,
    options: (q.options || []).map((o) => ({ value: o.value, label: localize(o.label, lang) })),
  };
};

/**
 * Convert a raw answer for (topic, step) into a normalized entity descriptor,
 * or null when the answer is invalid. Never touches the DB.
 */
const mapAnswerToEntities = (topic, step, answer) => {
  if (!isValidTopic(topic)) return null;
  const question = QUESTION_BANK[topic].questions[step];
  if (!question) return null;
  const { entity } = question;

  if (question.input_type === 'choice') {
    const option = question.options.find((o) => o.value === answer);
    if (!option) return null;
    return {
      domain: entity.domain,
      type: entity.type,
      value: option.score,
      value_text: option.value,
      unit: entity.unit,
    };
  }

  // number input
  const num = typeof answer === 'number' ? answer : Number(answer);
  if (!Number.isFinite(num)) return null;
  if (question.min != null && num < question.min) return null;
  if (question.max != null && num > question.max) return null;

  if (entity.domain === 'finance') {
    const amount = Math.round(num * 100) / 100;
    // Match FinancialLog.amount validate min 0.01 — never throw at create time.
    if (amount < 0.01) return null;
    return {
      domain: 'finance',
      type: entity.type,
      amount,
      currency: entity.currency,
      description: entity.description,
    };
  }
  // health numeric
  const out = { domain: 'health', type: entity.type, value: num, unit: entity.unit };
  if (entity.type === 'exercise') out.duration = Math.round(num);
  return out;
};

/**
 * Choose the most relevant topic from engine output + data-gap counts, honoring
 * dismissed topics. Pure — inputs are pre-fetched by pickTopic.
 *
 * @param {Object} engine   result of runInsightEngine (may be null)
 * @param {Object} counts   { sleep, mood, water, exercise, nutrition, expense, income }
 * @param {string[]} dismissed  topics the user recently dismissed
 * @returns {string|null}
 */
const selectTopic = (engine, counts = {}, dismissed = []) => {
  const blocked = new Set(dismissed);
  const available = (t) => isValidTopic(t) && !blocked.has(t);

  // 1) A "concerning" cross-domain pattern wins — probe it to give advice.
  const patterns = (engine && Array.isArray(engine.patterns)) ? engine.patterns : [];
  const concerning = patterns.find((p) => p.severity === 'concerning' && p.domain === 'both');
  if (concerning && available('sleep_spending')) return 'sleep_spending';

  // 2) Otherwise fill the biggest data gap (fewest logged points wins).
  const gaps = [
    { topic: 'sleep_spending', n: (counts.sleep || 0) + (counts.expense || 0) },
    { topic: 'mood_nutrition', n: (counts.mood || 0) + (counts.water || 0) + (counts.nutrition || 0) },
    { topic: 'activity_mood', n: (counts.exercise || 0) + (counts.mood || 0) },
    { topic: 'budget_savings', n: (counts.income || 0) + (counts.expense || 0) },
  ]
    .filter((g) => available(g.topic))
    .sort((a, b) => a.n - b.n);

  if (gaps.length === 0) return null;
  // Only proactively ask when at least one relevant domain is sparse (< 4 points).
  if (gaps[0].n < 4) return gaps[0].topic;
  return null;
};

// ────────────────────────────────────────────
// DB-BACKED HELPERS
// ────────────────────────────────────────────

const dismissKey = (topic) => `assistant.dismiss.${topic}`;

/** Topics the user dismissed within the cooldown window. */
const getDismissedTopics = async (userId) => {
  const cutoff = new Date(Date.now() - DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const rows = await UserMemory.findAll({
    where: {
      user_id: userId,
      mem_key: { [Op.in]: TOPICS.map(dismissKey) },
      updated_at: { [Op.gte]: cutoff },
    },
    attributes: ['mem_key'],
    raw: true,
  });
  return rows.map((r) => String(r.mem_key).replace('assistant.dismiss.', ''));
};

/** Persist that the user declined a topic so we stop offering it for a while. */
const recordDismissal = async (userId, topic) => {
  if (!isValidTopic(topic)) return null;
  const [row, createdNew] = await UserMemory.findOrCreate({
    where: { user_id: userId, mem_key: dismissKey(topic) },
    defaults: {
      user_id: userId,
      mem_key: dismissKey(topic),
      category: 'other',
      value: 'dismissed',
      source: 'user',
      confidence: 1,
    },
  });
  if (!createdNew) {
    await row.update({ value: 'dismissed', source: 'user', last_seen_at: new Date() });
  }
  return row;
};

const countByType = async (Model, userId, field, since) => {
  const rows = await Model.findAll({
    where: { user_id: userId, logged_at: { [Op.gte]: since } },
    attributes: [field],
    raw: true,
  });
  const counts = {};
  rows.forEach((r) => {
    const key = r[field];
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
};

/** Gather per-type counts over the last 7 days for gap detection. */
const gatherCounts = async (userId) => {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [health, finance] = await Promise.all([
    countByType(HealthLog, userId, 'type', weekAgo),
    countByType(FinancialLog, userId, 'type', weekAgo),
  ]);
  return {
    sleep: health.sleep || 0,
    mood: health.mood || 0,
    water: health.water || 0,
    exercise: health.exercise || 0,
    nutrition: health.nutrition || 0,
    steps: health.steps || 0,
    expense: finance.expense || 0,
    income: finance.income || 0,
  };
};

/**
 * Decide whether to proactively ask the user something.
 * @returns {{ topic, prompt, consent_required, questions_count, cross_domain }|{ topic:null }}
 */
const pickTopic = async (userId, lang = 'en') => {
  const [counts, dismissed] = await Promise.all([
    gatherCounts(userId),
    getDismissedTopics(userId),
  ]);

  let engine = null;
  try {
    engine = await runInsightEngine(userId);
  } catch {
    engine = null; // engine failure must not block a data-gap suggestion
  }

  const topic = selectTopic(engine, counts, dismissed);
  if (!topic) return { topic: null };

  return {
    topic,
    prompt: getPrompt(topic, lang),
    consent_required: true,
    questions_count: totalSteps(topic),
    cross_domain: isCrossDomain(topic),
  };
};

/**
 * Persist a single interview answer as a real log row.
 * @returns {{ domain, id }|null} the created row reference, or null if invalid
 */
const logAnswerEntities = async (userId, topic, step, answer) => {
  const entity = mapAnswerToEntities(topic, step, answer);
  if (!entity) return null;

  if (entity.domain === 'health') {
    const row = await HealthLog.create({
      user_id: userId,
      type: entity.type,
      value: entity.value,
      value_text: entity.value_text || null,
      unit: entity.unit,
      duration: entity.duration || null,
      notes: 'Logged via voice assistant interview',
      logged_at: new Date(),
      source: 'nlp',
    });
    return { domain: 'health', id: row.id, type: entity.type, value: entity.value };
  }

  const row = await FinancialLog.create({
    user_id: userId,
    type: entity.type,
    amount: entity.amount,
    currency: entity.currency,
    description: entity.description,
    logged_at: new Date(),
    source: 'nlp',
  });
  return { domain: 'finance', id: row.id, type: entity.type, amount: entity.amount };
};

/**
 * After the last answer, create cross-domain links (if applicable) and produce
 * advice from the freshly-enriched data via the existing Insight Engine.
 *
 * @param {number} userId
 * @param {string} topic
 * @param {{healthIds:number[], financeIds:number[], sourceMessage?:string}} logged
 * @param {string} lang
 */
const finalizeInterview = async (userId, topic, logged, lang = 'en') => {
  const links = [];
  if (isCrossDomain(topic) && logged.healthIds.length && logged.financeIds.length) {
    for (const hId of logged.healthIds) {
      for (const fId of logged.financeIds) {
        const link = await LinkedDomain.create({
          health_log_id: hId,
          financial_log_id: fId,
          source_message: logged.sourceMessage || `Voice interview: ${topic}`,
          link_type: 'manual',
          confidence: 0.9,
        });
        links.push(link.id);
      }
    }
  }
  const advice = await buildAdvice(userId, topic, lang);
  return { links, advice };
};

/**
 * Build topic-relevant advice by re-running the Insight Engine over the now
 * up-to-date data. Falls back to a generic acknowledgement if nothing specific
 * is found.
 */
const buildAdvice = async (userId, topic, lang = 'en') => {
  let engine = null;
  try {
    engine = await runInsightEngine(userId);
  } catch {
    engine = null;
  }

  const domainFor = {
    sleep_spending: ['both', 'finance', 'health'],
    mood_nutrition: ['health'],
    activity_mood: ['health'],
    budget_savings: ['finance'],
  }[topic] || ['both', 'health', 'finance'];

  const recs = (engine && Array.isArray(engine.recommendations)) ? engine.recommendations : [];
  const arabic = pickLang(lang) === 'ar';
  const relevant = recs
    .filter((r) => domainFor.includes(r.domain))
    .slice(0, 3)
    .map((r) => ({
      // Engine attaches _ar mirrors (insightLocalizer) — serve the requested language.
      text: (arabic && r.text_ar) || r.text,
      priority: r.priority || 'medium',
      domain: r.domain,
      reason: (arabic ? r.reason_ar : r.reason) || r.reason || null,
    }));

  const fallback = {
    en: 'Thanks — I saved that. Keep logging for a day or two and I\'ll drop a tip that fits you on your dashboard.',
    ar: 'شكرًا — سجّلت ذلك. واصل التسجيل يومًا أو يومين وسأعرض لك نصيحة تناسبك على لوحتك.',
  };

  return {
    topic,
    title: getPrompt(topic, lang),
    advice: relevant.length ? relevant : [{ text: localize(fallback, lang), priority: 'low', domain: 'both', reason: null }],
    scores: engine ? { health: engine.health_score, financial: engine.financial_health_score } : null,
    cross_domain_insight: engine
      ? ((arabic && engine.cross_domain_insights_ar) || engine.cross_domain_insights)
      : null,
  };
};

module.exports = {
  // constants
  TOPICS,
  QUESTION_BANK,
  DISMISS_COOLDOWN_DAYS,
  // pure
  isValidTopic,
  isCrossDomain,
  totalSteps,
  getPrompt,
  nextQuestion,
  mapAnswerToEntities,
  selectTopic,
  // db-backed
  gatherCounts,
  getDismissedTopics,
  recordDismissal,
  pickTopic,
  logAnswerEntities,
  finalizeInterview,
  buildAdvice,
};
