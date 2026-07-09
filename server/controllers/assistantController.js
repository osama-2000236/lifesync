// server/controllers/assistantController.js
// ============================================
// Voice Assistant — Cross-Domain Interview Controller
// ============================================
// Thin HTTP layer over crossDomainInterviewService. It owns the short-lived,
// per-user interview state (which question we're on + the ids logged so far) so
// the final step can create the cross-domain link and generate advice. State is
// in-memory with a TTL, mirroring the chatController clarification pattern; the
// facts themselves are written to the DB immediately (durable, dashboard-visible).
// ============================================

const { body } = require('express-validator');
const interview = require('../services/ai/crossDomainInterviewService');
const { success, error } = require('../utils/responseHelper');

// ────────────────────────────────────────────
// In-memory interview state (per user)
// ────────────────────────────────────────────
const activeInterviews = new Map();
const INTERVIEW_TTL_MS = 10 * 60 * 1000;

// Evict interview state older than the TTL. Pure over `activeInterviews` so it
// can be unit-tested without waiting on the timer.
const evictStale = (now = Date.now()) => {
  for (const [userId, state] of activeInterviews) {
    if (now - state.createdAt > INTERVIEW_TTL_MS) activeInterviews.delete(userId);
  }
};

// unref() so the timer never keeps the process (or Jest) alive.
const sweepInterval = setInterval(evictStale, 60_000);
sweepInterval.unref();

const langOf = (req) => (req.body?.lang === 'ar' ? 'ar' : 'en');

// ────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────
const startValidation = [
  body('topic').isString().notEmpty(),
  body('consent').isBoolean(),
  body('lang').optional().isString().isLength({ max: 8 }),
];

const answerValidation = [
  body('step').isInt({ min: 0 }),
  body('answer').exists(),
  body('lang').optional().isString().isLength({ max: 8 }),
];

// ────────────────────────────────────────────
// GET /api/assistant/suggestion
// ────────────────────────────────────────────
const getSuggestion = async (req, res, next) => {
  try {
    const lang = req.query?.lang === 'ar' ? 'ar' : 'en';
    const suggestion = await interview.pickTopic(req.user.id, lang);
    return success(res, suggestion, 'Assistant suggestion');
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────
// POST /api/assistant/interview/start
// ────────────────────────────────────────────
const startInterview = async (req, res, next) => {
  try {
    const { topic, consent } = req.body;
    const lang = langOf(req);

    if (!interview.isValidTopic(topic)) {
      return error(res, 'Unknown interview topic.', 400, 'INVALID_TOPIC');
    }

    if (!consent) {
      await interview.recordDismissal(req.user.id, topic);
      activeInterviews.delete(req.user.id);
      return success(res, { dismissed: true, topic }, 'Interview dismissed');
    }

    // Skip steps already logged today (e.g. mood 3/10 → do not re-ask mood).
    const today = await interview.gatherTodayCoverage(req.user.id);
    const startStep = interview.firstOpenStep(topic, today);
    if (startStep == null) {
      return success(res, {
        topic,
        done: true,
        skipped: true,
        message: 'All questions for this topic already logged today.',
      }, 'Interview not needed today');
    }

    activeInterviews.set(req.user.id, {
      topic,
      step: startStep,
      healthIds: [],
      financeIds: [],
      createdAt: Date.now(),
    });

    const question = interview.nextQuestion(topic, startStep, lang);
    return success(res, {
      topic,
      cross_domain: interview.isCrossDomain(topic),
      total: interview.totalSteps(topic),
      question,
    }, 'Interview started');
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────
// POST /api/assistant/interview/answer
// ────────────────────────────────────────────
const answerInterview = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const lang = langOf(req);
    const { step, answer } = req.body;

    const state = activeInterviews.get(userId);
    if (!state) {
      return error(res, 'No active interview. Start one first.', 409, 'NO_ACTIVE_INTERVIEW');
    }
    if (Number(step) !== state.step) {
      return error(res, 'Unexpected interview step.', 409, 'STEP_MISMATCH');
    }

    const logged = await interview.logAnswerEntities(userId, state.topic, state.step, answer);
    if (!logged) {
      return error(res, 'Invalid answer for this question.', 422, 'INVALID_ANSWER');
    }
    if (logged.domain === 'health') state.healthIds.push(logged.id);
    else state.financeIds.push(logged.id);

    // Advance past steps already satisfied today (including what we just logged).
    const today = await interview.gatherTodayCoverage(userId);
    const total = interview.totalSteps(state.topic);
    let nextStep = state.step + 1;
    while (nextStep < total && interview.stepCoveredToday(state.topic, nextStep, today)) {
      nextStep += 1;
    }
    state.step = nextStep;

    const nextQ = nextStep < total ? interview.nextQuestion(state.topic, nextStep, lang) : null;
    if (nextQ) {
      state.createdAt = Date.now(); // keep the session warm
      return success(res, { done: false, logged, question: nextQ }, 'Answer logged');
    }

    // Last answer — link + advise, then clear state.
    const { links, advice } = await interview.finalizeInterview(userId, state.topic, {
      healthIds: state.healthIds,
      financeIds: state.financeIds,
      sourceMessage: `Voice interview: ${state.topic}`,
    }, lang);
    activeInterviews.delete(userId);

    return success(res, {
      done: true,
      logged,
      links,
      advice,
      entities_logged: { health: state.healthIds, finance: state.financeIds },
    }, 'Interview complete');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getSuggestion,
  startInterview,
  answerInterview,
  startValidation,
  answerValidation,
  evictStale,
  _activeInterviews: activeInterviews,
  _sweepInterval: sweepInterval,
};
