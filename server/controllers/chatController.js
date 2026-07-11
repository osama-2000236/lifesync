// server/controllers/chatController.js
// ============================================
// Chat Controller v3
// Refactored for:
//   - SSE streaming (bypasses proxy idle timeouts)
//   - Optimistic DB writes (user msg + pending AI row written BEFORE inference)
//   - Cold-start retry with status events
//   - Error-state persistence (dashboard always reflects truth)
//   - Backwards-compatible JSON endpoint retained
// ============================================

const { randomUUID } = require('crypto');
const { body } = require('express-validator');
const { Op } = require('sequelize');
const { parseMessage, _detectLang } = require('../services/ai/nlpService');
const { buildBertContext } = require('../services/ai/bertContextService');
const { recordTurnMemories } = require('../services/ai/memoryService');
const { resolveModel } = require('../services/ai/modelRuntimeManager');
const { resolveSessionModel, assistantModelMeta } = require('../services/ai/sessionModelLock');
const HealthLog = require('../models/HealthLog');
const FinancialLog = require('../models/FinancialLog');
const Category = require('../models/Category');
const ChatLog = require('../models/ChatLog');
const LinkedDomain = require('../models/LinkedDomain');
const UserGoal = require('../models/UserGoal');
const { getFirestore } = require('../config/firebase');
const { createStore } = require('../services/ephemeralStore');
const { success, error } = require('../utils/responseHelper');

// ============================================
// Status Column Availability Probe
// ============================================
// The `status` column may not exist yet if the migration hasn't run.
// We probe once on first use and gracefully degrade if missing.
let _statusColumnReady = null; // null = unknown, true/false = probed

const hasStatusColumn = async () => {
  if (_statusColumnReady !== null) return _statusColumnReady;
  try {
    const desc = await ChatLog.describe();
    _statusColumnReady = !!desc.status;
  } catch {
    _statusColumnReady = false;
  }
  return _statusColumnReady;
};

/** Strip `status` from fields when the column is unavailable */
const safeFields = async (fields) => {
  if (await hasStatusColumn()) return fields;
  const { status, ...rest } = fields;
  return rest;
};

/** Safe update — only include `status` if column exists */
const safeUpdate = async (row, fields) => {
  const safe = await safeFields(fields);
  return row.update(safe);
};

// ============================================
// Clarification State — shared/durable via ephemeralStore. The store's TTL
// evicts stale clarifications (no local sweep timer); a mid-clarification turn
// now survives restart / lands correctly on any instance.
// ============================================
const CLARIFICATION_TTL_MS = 5 * 60 * 1000;
const pendingClarifications = createStore('clarif');

// ============================================
// VALIDATION
// ============================================

const chatValidation = [
  body('message')
    .trim()
    .notEmpty()
    .withMessage('Message cannot be empty.')
    .isLength({ max: 2000 })
    .withMessage('Message must be under 2000 characters.'),
  body('session_id')
    .optional()
    .isString(),
  body('model')
    .optional()
    .isString(),
  body('lang')
    .optional()
    .isString()
    .isLength({ max: 8 }),
  body('context_window')
    .optional()
    .isIn(['standard', 'deep', 'max']),
];

/** Per-request chat model → { provider, model } options for parseMessage.
 *  Body `model` wins. Prefer generative picks over bert_local preferred so a
 *  profile still set to BERT never hijacks a voice/chat turn that sent Gemma. */
const resolveChatOptions = (modelId, userPreferred = null) => {
  const requested = String(modelId || '').trim().toLowerCase();
  const preferred = String(userPreferred || '').trim().toLowerCase();
  // Prefer explicit request; only use preferred when request is empty.
  // If preferred is bert_local and request is empty, still resolve bert (chat
  // classifier path) — voice client always sends a voice-trio id.
  const pick = requested || preferred || null;
  const resolved = resolveModel(pick);
  return resolved ? { provider: resolved.provider, model: resolved.model, catalog_id: resolved.id } : {};
};

// ============================================
// HELPERS
// ============================================

const resolveCategory = async (categoryName, domain, userId) => {
  if (!categoryName) return null;

  let category = await Category.findOne({
    where: {
      name: categoryName,
      domain,
      [Op.or]: [{ is_default: true }, { user_id: userId }],
    },
  });

  if (!category) {
    category = await Category.findOne({
      where: {
        name: { [Op.like]: `%${categoryName}%` },
        domain,
        [Op.or]: [{ is_default: true }, { user_id: userId }],
      },
    });
  }

  return category;
};

const createHealthEntries = async (entities, userId) => {
  const entries = [];
  for (const entity of entities) {
    if (entity.domain !== 'health') continue;
    const category = await resolveCategory(entity.category, 'health', userId);
    const entry = await HealthLog.create({
      user_id: userId,
      type: entity.type,
      value: entity.value,
      value_text: entity.value_text || null,
      unit: entity.unit || null,
      duration: entity.duration || null,
      notes: entity.activity || null,
      logged_at: new Date(),
      source: 'nlp',
      category_id: category?.id || null,
    });
    entries.push(entry);
  }
  return entries;
};

const createFinanceEntries = async (entities, userId) => {
  const entries = [];
  for (const entity of entities) {
    if (entity.domain !== 'finance') continue;
    const category = await resolveCategory(entity.category, 'finance', userId);
    const entry = await FinancialLog.create({
      user_id: userId,
      type: entity.type,
      amount: entity.amount,
      currency: entity.currency || 'USD',
      description: entity.description || entity.activity || null,
      logged_at: new Date(),
      source: 'nlp',
      category_id: category?.id || null,
    });
    entries.push(entry);
  }
  return entries;
};

const createCrossDomainLinks = async (healthEntries, financeEntries, originalMessage) => {
  // Prefer substantive health metrics when pairing; fall back to all health rows
  // so food-meal + expense still links, but never invent rows here.
  const substantive = healthEntries.filter((h) => {
    const unit = String(h.unit || '').toLowerCase();
    if (unit === 'meal') return true; // qualitative meal presence is intentional XD
    const v = Number(h.getDataValue ? h.getDataValue('value') : h.value);
    return Number.isFinite(v) && v > 0;
  });
  const healthSide = substantive.length ? substantive : healthEntries;
  const links = [];
  for (const hEntry of healthSide) {
    for (const fEntry of financeEntries) {
      const link = await LinkedDomain.create({
        health_log_id: hEntry.id,
        financial_log_id: fEntry.id,
        source_message: originalMessage,
        link_type: 'auto_nlp',
        confidence: 0.85,
      });
      links.push(link);
    }
  }
  return links;
};

const syncToFirebase = async (sessionId, userId, userMessage, assistantMessage, nlpResult) => {
  const firestore = getFirestore();
  if (!firestore) return;

  try {
    const sessionRef = firestore.collection('chat_sessions').doc(sessionId);
    await sessionRef.set({
      user_id: userId,
      last_message_at: new Date(),
    }, { merge: true });

    const messagesRef = sessionRef.collection('messages');
    await messagesRef.add({
      role: 'user',
      content: userMessage,
      parsed_intent: nlpResult.intent,
      entities: nlpResult.entities,
      timestamp: new Date(),
    });
    await messagesRef.add({
      role: 'assistant',
      content: assistantMessage,
      needs_clarification: nlpResult.needs_clarification,
      timestamp: new Date(),
    });
  } catch (fbError) {
    console.warn('Firebase sync warning:', fbError.message);
  }
};

// ============================================
// SSE HELPER
// ============================================

/**
 * Send an SSE event to the client.
 * Format: "event: <name>\ndata: <JSON>\n\n"
 */
const sseWrite = (res, event, data) => {
  // The client may have disconnected mid-turn (voice barge-in, tab close) —
  // writing to an already-closed response just throws/warns for no benefit.
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};

// Model-neutral: this fires when the pipeline throws, whatever model the user
// picked — naming "Gemma" here lied whenever the picker said GPT/Llama.
// Language follows the user's turn: an Arabic message gets an Arabic error.
const resolveAIErrorMessage = (aiError, userMessage) =>
  aiError?.userMessage
  || (_detectLang(userMessage) === 'ar'
    ? 'عذرًا، المساعد غير متاح مؤقتًا. رسالتك محفوظة ويمكنك المحاولة مرة أخرى بعد قليل.'
    : 'Sorry, the assistant is temporarily unavailable. Your message was saved and you can try again shortly.');

/** Generative pick failed: log Track A entities if any, persist error row, return payload. */
const handleGenerativeFailure = async ({
  nlpResult, message, userId, userChatLog, assistantChatLog, effectiveModelId, sessionModel, currentSessionId,
}) => {
  let healthEntries = [];
  let financeEntries = [];
  let linkedDomainEntries = [];
  if (Array.isArray(nlpResult.entities) && nlpResult.entities.length > 0) {
    const healthEntities = nlpResult.entities.filter((e) => e.domain === 'health');
    const financeEntities = nlpResult.entities.filter((e) => e.domain === 'finance');
    if (healthEntities.length > 0) healthEntries = await createHealthEntries(healthEntities, userId);
    if (financeEntities.length > 0) financeEntries = await createFinanceEntries(financeEntities, userId);
    if (nlpResult.is_cross_domain && healthEntries.length > 0 && financeEntries.length > 0) {
      linkedDomainEntries = await createCrossDomainLinks(
        healthEntries, financeEntries, nlpResult.original_message || message,
      );
    }
  }

  const errorMessage = nlpResult.generative_error_user
    || nlpResult.generative_error
    || 'The selected model did not reply.';
  const rawErr = String(nlpResult.generative_error || '');
  const retryable = /\b(429|502|503|timeout|rate.?limit|busy|overloaded)\b/i.test(rawErr);

  await safeUpdate(userChatLog, {
    intent: nlpResult.intent,
    entities_json: nlpResult.entities || [],
    processing_time_ms: nlpResult.processing_time_ms,
    status: 'complete',
  });
  await safeUpdate(assistantChatLog, {
    message: errorMessage,
    intent: 'error',
    entities_json: assistantModelMeta(effectiveModelId),
    status: 'error',
  });

  return {
    session_id: currentSessionId,
    message: errorMessage,
    response: errorMessage,
    retryable,
    code: 'MODEL_UNAVAILABLE',
    intent: 'error',
    domain: nlpResult.domain || 'general',
    needs_clarification: false,
    confidence: 0,
    error: true,
    model_runtime: {
      ...(nlpResult.model_runtime || {}),
      catalog_model: effectiveModelId || null,
      model_switch_denied: Boolean(sessionModel.denied),
    },
    entities_logged: {
      health: healthEntries.map((e) => ({ id: e.id, type: e.type, value: e.getDataValue('value') })),
      finance: financeEntries.map((e) => ({ id: e.id, type: e.type, amount: e.getDataValue('amount') })),
      linked: linkedDomainEntries.map((l) => ({
        id: l.id, health_log_id: l.health_log_id, financial_log_id: l.financial_log_id,
      })),
    },
    processing_time_ms: nlpResult.processing_time_ms,
  };
};

// ============================================
// STREAMING ENDPOINT — POST /api/chat/stream
// ============================================

/**
 * SSE streaming chat endpoint.
 *
 * Event sequence:
 *   1. event: ack          — user message persisted, pending AI row created
 *   2. event: status       — "Waking up AI..." on cold-start retry
 *   3. event: complete     — full NLP result + entities logged
 *   OR event: error        — HF failure, error persisted to DB
 *   4. event: done         — stream closed
 */
const processMessageStream = async (req, res) => {
  const { message, session_id } = req.body;
  const userId = req.user.id;
  const currentSessionId = session_id || randomUUID();
  // Session model lock: mid-conversation model switch is denied server-side
  // (client already shows a friendly hint; this keeps style consistent even
  // if the request is forged). New session_id unlocks.
  const sessionModel = await resolveSessionModel(
    userId,
    currentSessionId,
    req.body?.model || req.user?.preferred_model || null,
  );
  const effectiveModelId = sessionModel.modelId || req.body?.model || req.user?.preferred_model || null;
  // lang = UI/client-detected hint (tiebreaker); server re-detects from text
  // and wins when scripts disagree — real-time AR↔EN switch.
  const aiOptions = {
    ...resolveChatOptions(effectiveModelId, req.user?.preferred_model),
    lang: req.body?.lang || null,
    sessionId: currentSessionId,
  };

  // If the client disconnects mid-stream (voice barge-in, tab close), stop the
  // upstream model call instead of burning tokens on a reply nobody will see.
  // Firing after a normal res.end() is a harmless no-op (request already settled).
  const abortController = new AbortController();
  aiOptions.signal = abortController.signal;
  req.on('close', () => abortController.abort());

  // ─── Set up SSE headers ───
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable Nginx buffering for SSE
  });

  // Send a heartbeat comment immediately to prevent proxy idle timeout
  res.write(':heartbeat\n\n');

  let userChatLog;
  let assistantChatLog;

  try {
    // ─── Step 1: Optimistic DB writes ───
    // Write user message immediately (status: 'sent')
    userChatLog = await ChatLog.create(await safeFields({
      user_id: userId,
      session_id: currentSessionId,
      role: 'user',
      message,
      intent: null,
      entities_json: null,
      processing_time_ms: null,
      status: 'sent',
    }));

    // Create pending assistant row (placeholder — will be updated)
    assistantChatLog = await ChatLog.create(await safeFields({
      user_id: userId,
      session_id: currentSessionId,
      role: 'assistant',
      message: '',
      intent: null,
      entities_json: null,
      status: 'pending',
    }));

    // ACK — client now knows both rows exist in DB
    sseWrite(res, 'ack', {
      session_id: currentSessionId,
      user_message_id: userChatLog.id,
      assistant_message_id: assistantChatLog.id,
      catalog_model: effectiveModelId || null,
      model_switch_denied: Boolean(sessionModel.denied),
    });
    if (sessionModel.denied) {
      sseWrite(res, 'status', {
        message: 'model_locked',
        code: 'MODEL_SWITCH_DENIED',
        locked_model: sessionModel.locked,
        requested_model: sessionModel.requested,
      });
    }

    // ─── Step 2: Check for pending clarification ───
    const pending = await pendingClarifications.get(userId);
    const nlpContext = await buildBertContext(userId, currentSessionId, {
      excludeChatIds: [userChatLog.id, assistantChatLog.id],
      window: req.body?.context_window || null,
    });
    let nlpResult;

    // Heartbeat interval to keep the connection alive during HF inference
    const heartbeat = setInterval(() => {
      res.write(':heartbeat\n\n');
    }, 15_000);

    // Stream the conversational reply token-by-token so the voice assistant
    // (and any other client) can render/speak it before the full turn finishes.
    let streamedText = '';
    const onDelta = (chunk) => {
      streamedText += chunk;
      sseWrite(res, 'delta', { session_id: currentSessionId, text: chunk });
    };

    try {
      if (pending && pending.sessionId === currentSessionId) {
        nlpResult = await parseMessage(message, {
          originalMessage: pending.originalMessage,
          clarificationQuestion: pending.clarificationQuestion,
          clarificationOptions: pending.clarificationOptions,
        }, nlpContext, aiOptions, onDelta);
        await pendingClarifications.del(userId);
      } else {
        // Fresh message — run the two-track pipeline (extract + converse).
        sseWrite(res, 'status', { message: 'Processing your message...' });
        nlpResult = await parseMessage(message, null, nlpContext, aiOptions, onDelta);
      }
    } catch (aiError) {
      clearInterval(heartbeat);

      // ─── Client stopped the stream (stop button / barge-in / tab close) ───
      // Not an AI failure: keep whatever partial reply already streamed as a
      // normal history row instead of polluting the session with a fake error.
      if (abortController.signal.aborted) {
        await safeUpdate(userChatLog, { status: 'complete' });
        await safeUpdate(assistantChatLog, streamedText
          ? { message: streamedText, status: 'complete' }
          : { message: '', intent: 'aborted', status: 'error' });
        return res.end();
      }

      const errorMessage = resolveAIErrorMessage(aiError, message);

      // ─── AI Failed — persist error state to DB ───
      await safeUpdate(userChatLog, { intent: 'unclear', status: 'complete' });
      await safeUpdate(assistantChatLog, {
        message: errorMessage,
        intent: 'error',
        status: 'error',
      });

      sseWrite(res, 'error', {
        session_id: currentSessionId,
        message: errorMessage,
        retryable: aiError?.retryable !== false,
        code: aiError?.code || 'AI_UNAVAILABLE',
      });
      sseWrite(res, 'done', {});
      return res.end();
    }

    clearInterval(heartbeat);

    // Remember durable facts the user stated this turn (non-blocking).
    // Memory lives in the DB, so it persists across model switches.
    recordTurnMemories(userId, message, nlpResult).catch(() => {});

    // ─── Generative model failed — honest error, never BERT template as reply ───
    if (nlpResult.generative_failed || nlpResult.model_runtime?.responder === 'model_error') {
      const payload = await handleGenerativeFailure({
        nlpResult, message, userId, userChatLog, assistantChatLog,
        effectiveModelId, sessionModel, currentSessionId,
      });
      sseWrite(res, 'error', payload);
      sseWrite(res, 'done', {});
      return res.end();
    }

    // ─── Step 3: Handle clarification needed ───
    if (nlpResult.needs_clarification) {
      await pendingClarifications.set(userId, {
        originalMessage: message,
        clarificationQuestion: nlpResult.clarification_question,
        clarificationOptions: nlpResult.clarification_options,
        sessionId: currentSessionId,
        createdAt: Date.now(),
      }, CLARIFICATION_TTL_MS);

      // Update both DB rows
      await safeUpdate(userChatLog, {
        intent: nlpResult.intent,
        entities_json: [],
        processing_time_ms: nlpResult.processing_time_ms,
        status: 'complete',
      });
      await safeUpdate(assistantChatLog, {
        message: nlpResult.clarification_question,
        intent: 'clarification',
        entities_json: assistantModelMeta(effectiveModelId),
        status: 'complete',
      });

      // Firebase sync (non-blocking)
      syncToFirebase(currentSessionId, userId, message, nlpResult.clarification_question, nlpResult).catch(() => {});

      sseWrite(res, 'complete', {
        session_id: currentSessionId,
        intent: nlpResult.intent,
        domain: nlpResult.domain,
        response: nlpResult.response,
        needs_clarification: true,
        clarification_question: nlpResult.clarification_question,
        clarification_options: nlpResult.clarification_options,
        confidence: nlpResult.confidence,
        is_cross_domain: false,
        entities_logged: { health: [], finance: [], linked: [] },
        model_runtime: {
          ...(nlpResult.model_runtime || {}),
          catalog_model: effectiveModelId || null,
          model_switch_denied: Boolean(sessionModel.denied),
        },
        processing_time_ms: nlpResult.processing_time_ms,
      });
      sseWrite(res, 'done', {});
      return res.end();
    }

    // ─── Step 4: Create entries from extracted entities ───
    let healthEntries = [];
    let financeEntries = [];
    let linkedDomainEntries = [];

    if (nlpResult.entities.length > 0) {
      const healthEntities = nlpResult.entities.filter((e) => e.domain === 'health');
      const financeEntities = nlpResult.entities.filter((e) => e.domain === 'finance');

      if (healthEntities.length > 0) {
        healthEntries = await createHealthEntries(healthEntities, userId);
      }
      if (financeEntities.length > 0) {
        financeEntries = await createFinanceEntries(financeEntities, userId);
      }
      if (nlpResult.is_cross_domain && healthEntries.length > 0 && financeEntries.length > 0) {
        linkedDomainEntries = await createCrossDomainLinks(
          healthEntries, financeEntries, nlpResult.original_message || message
        );
      }
    }

    // set_goal with a parsed target → persist it (the reply promises tracking).
    // Same active goal for the metric+period gets its target updated, not duplicated.
    if (nlpResult._goal) {
      try {
        const g = nlpResult._goal;
        const where = { user_id: userId, domain: g.domain, metric_type: g.metric_type, period: g.period, status: 'active' };
        const existing = await UserGoal.findOne({ where });
        if (existing) await existing.update({ target_value: g.target_value, unit: g.unit });
        else await UserGoal.create({ ...where, target_value: g.target_value, unit: g.unit, start_date: new Date().toISOString().slice(0, 10) });
      } catch (goalErr) {
        console.error('Failed to persist goal from chat:', goalErr.message);
      }
    }

    // ─── Step 5: Update chat log rows with final data ───
    if (nlpResult.entities.length > 0) {
      sseWrite(res, 'status', { message: 'Logging your entries...' });
    }

    await safeUpdate(userChatLog, {
      intent: nlpResult.intent,
      entities_json: nlpResult.entities,
      processing_time_ms: nlpResult.processing_time_ms,
      status: 'complete',
    });

    await safeUpdate(assistantChatLog, {
      message: nlpResult.response,
      intent: null,
      entities_json: assistantModelMeta(effectiveModelId),
      status: 'complete',
    });

    // ─── Step 6: Firebase sync (non-blocking) ───
    syncToFirebase(currentSessionId, userId, message, nlpResult.response, nlpResult).catch(() => {});

    // ─── Step 7: Send complete event ───
    sseWrite(res, 'complete', {
      session_id: currentSessionId,
      intent: nlpResult.intent,
      domain: nlpResult.domain,
      response: nlpResult.response,
      needs_clarification: false,
      confidence: nlpResult.confidence,
      is_cross_domain: nlpResult.is_cross_domain,
      entities_logged: {
        health: healthEntries.map((e) => ({
          id: e.id, type: e.type, value: e.getDataValue('value'),
        })),
        finance: financeEntries.map((e) => ({
          id: e.id, type: e.type, amount: e.getDataValue('amount'),
        })),
        linked: linkedDomainEntries.map((l) => ({
          id: l.id, health_log_id: l.health_log_id, financial_log_id: l.financial_log_id,
        })),
      },
      model_runtime: {
        ...(nlpResult.model_runtime || {}),
        catalog_model: effectiveModelId || null,
        model_switch_denied: Boolean(sessionModel.denied),
      },
      processing_time_ms: nlpResult.processing_time_ms,
    });
    sseWrite(res, 'done', {});
    return res.end();

  } catch (err) {
    // If we hit ER_BAD_FIELD_ERROR, reset the probe so next request retries
    if (err.original?.code === 'ER_BAD_FIELD_ERROR') {
      _statusColumnReady = null;
    }

    // Catch-all: update DB rows to error state if they exist
    if (assistantChatLog) {
      await safeUpdate(assistantChatLog, {
        message: 'An unexpected error occurred while processing your message.',
        status: 'error',
      }).catch(() => {});
    }
    if (userChatLog) {
      await safeUpdate(userChatLog, { status: 'complete' }).catch(() => {});
    }

    sseWrite(res, 'error', {
      session_id: currentSessionId,
      message: 'An unexpected error occurred. Your message was saved.',
      retryable: true,
    });
    sseWrite(res, 'done', {});
    return res.end();
  }
};

// ============================================
// ORIGINAL JSON ENDPOINT — POST /api/chat
// (Retained for backwards compatibility)
// ============================================

const processMessage = async (req, res, next) => {
  try {
    const { message, session_id } = req.body;
    const userId = req.user.id;
    const currentSessionId = session_id || randomUUID();
    const sessionModel = await resolveSessionModel(
      userId,
      currentSessionId,
      req.body?.model || req.user?.preferred_model || null,
    );
    const effectiveModelId = sessionModel.modelId || req.body?.model || req.user?.preferred_model || null;
    const aiOptions = {
      ...resolveChatOptions(effectiveModelId, req.user?.preferred_model),
      lang: req.body?.lang || null,
      sessionId: currentSessionId,
    };

    // ─── Optimistic write: persist user message immediately ───
    const userChatLog = await ChatLog.create(await safeFields({
      user_id: userId,
      session_id: currentSessionId,
      role: 'user',
      message,
      intent: null,
      entities_json: null,
      processing_time_ms: null,
      status: 'sent',
    }));

    const assistantChatLog = await ChatLog.create(await safeFields({
      user_id: userId,
      session_id: currentSessionId,
      role: 'assistant',
      message: '',
      intent: null,
      entities_json: null,
      status: 'pending',
    }));

    // ─── NLP Processing ───
    const pending = await pendingClarifications.get(userId);
    const nlpContext = await buildBertContext(userId, currentSessionId, {
      excludeChatIds: [userChatLog.id, assistantChatLog.id],
      window: req.body?.context_window || null,
    });
    let nlpResult;

    try {
      if (pending && pending.sessionId === currentSessionId) {
        nlpResult = await parseMessage(message, {
          originalMessage: pending.originalMessage,
          clarificationQuestion: pending.clarificationQuestion,
          clarificationOptions: pending.clarificationOptions,
        }, nlpContext, aiOptions);
        await pendingClarifications.del(userId);
      } else {
        nlpResult = await parseMessage(message, null, nlpContext, aiOptions);
      }
    } catch (aiError) {
      const errorMessage = resolveAIErrorMessage(aiError, message);

      // AI failed — persist error state, still return a response
      await safeUpdate(userChatLog, { intent: 'unclear', status: 'complete' });
      await safeUpdate(assistantChatLog, {
        message: errorMessage,
        intent: 'error',
        status: 'error',
      });

      return success(res, {
        session_id: currentSessionId,
        intent: 'error',
        domain: 'general',
        response: errorMessage,
        // (memory not recorded on AI failure)
        needs_clarification: false,
        confidence: 0,
        entities_logged: { health: [], finance: [], linked: [] },
        processing_time_ms: aiError?.processing_time_ms || 0,
        error: true,
        retryable: aiError?.retryable !== false,
      });
    }

    // Remember durable facts stated this turn (non-blocking, DB-backed).
    recordTurnMemories(userId, message, nlpResult).catch(() => {});

    // Generative model failed — honest error body (same policy as SSE stream).
    if (nlpResult.generative_failed || nlpResult.model_runtime?.responder === 'model_error') {
      const payload = await handleGenerativeFailure({
        nlpResult, message, userId, userChatLog, assistantChatLog,
        effectiveModelId, sessionModel, currentSessionId,
      });
      return success(res, payload);
    }

    // ─── Handle clarification ───
    if (nlpResult.needs_clarification) {
      await pendingClarifications.set(userId, {
        originalMessage: message,
        clarificationQuestion: nlpResult.clarification_question,
        clarificationOptions: nlpResult.clarification_options,
        sessionId: currentSessionId,
        createdAt: Date.now(),
      }, CLARIFICATION_TTL_MS);

      await safeUpdate(userChatLog, {
        intent: nlpResult.intent,
        entities_json: [],
        processing_time_ms: nlpResult.processing_time_ms,
        status: 'complete',
      });
      await safeUpdate(assistantChatLog, {
        message: nlpResult.clarification_question,
        intent: 'clarification',
        entities_json: assistantModelMeta(effectiveModelId),
        status: 'complete',
      });

      syncToFirebase(currentSessionId, userId, message, nlpResult.clarification_question, nlpResult).catch(() => {});

      return success(res, {
        session_id: currentSessionId,
        intent: nlpResult.intent,
        domain: nlpResult.domain,
        response: nlpResult.response,
        needs_clarification: true,
        clarification_question: nlpResult.clarification_question,
        clarification_options: nlpResult.clarification_options,
        confidence: nlpResult.confidence,
        entities_logged: { health: [], finance: [] },
        model_runtime: {
          ...(nlpResult.model_runtime || {}),
          catalog_model: effectiveModelId || null,
          model_switch_denied: Boolean(sessionModel.denied),
        },
        processing_time_ms: nlpResult.processing_time_ms,
      });
    }

    // ─── Create entries ───
    let healthEntries = [];
    let financeEntries = [];
    let linkedDomainEntries = [];

    if (nlpResult.entities.length > 0) {
      const healthEntities = nlpResult.entities.filter((e) => e.domain === 'health');
      const financeEntities = nlpResult.entities.filter((e) => e.domain === 'finance');

      if (healthEntities.length > 0) {
        healthEntries = await createHealthEntries(healthEntities, userId);
      }
      if (financeEntities.length > 0) {
        financeEntries = await createFinanceEntries(financeEntities, userId);
      }
      if (nlpResult.is_cross_domain && healthEntries.length > 0 && financeEntries.length > 0) {
        linkedDomainEntries = await createCrossDomainLinks(
          healthEntries, financeEntries, nlpResult.original_message || message
        );
      }
    }

    // ─── Finalize chat logs ───
    await safeUpdate(userChatLog, {
      intent: nlpResult.intent,
      entities_json: nlpResult.entities,
      processing_time_ms: nlpResult.processing_time_ms,
      status: 'complete',
    });
    await safeUpdate(assistantChatLog, {
      message: nlpResult.response,
      intent: null,
      entities_json: assistantModelMeta(effectiveModelId),
      status: 'complete',
    });

    syncToFirebase(currentSessionId, userId, message, nlpResult.response, nlpResult).catch(() => {});

    return success(res, {
      session_id: currentSessionId,
      intent: nlpResult.intent,
      domain: nlpResult.domain,
      response: nlpResult.response,
      needs_clarification: false,
      confidence: nlpResult.confidence,
      is_cross_domain: nlpResult.is_cross_domain,
      entities_logged: {
        health: healthEntries.map((e) => ({
          id: e.id, type: e.type, value: e.getDataValue('value'),
        })),
        finance: financeEntries.map((e) => ({
          id: e.id, type: e.type, amount: e.getDataValue('amount'),
        })),
        linked: linkedDomainEntries.map((l) => ({
          id: l.id, health_log_id: l.health_log_id, financial_log_id: l.financial_log_id,
        })),
      },
      model_runtime: {
        ...(nlpResult.model_runtime || {}),
        catalog_model: effectiveModelId || null,
        model_switch_denied: Boolean(sessionModel.denied),
      },
      processing_time_ms: nlpResult.processing_time_ms,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/chat/history
 */
const getChatHistory = async (req, res, next) => {
  try {
    const { session_id } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const where = { user_id: req.user.id };
    if (session_id) where.session_id = String(session_id).slice(0, 128);
    const offset = (page - 1) * limit;
    const { count, rows } = await ChatLog.findAndCountAll({
      where,
      order: [['created_at', 'ASC']],
      limit,
      offset,
    });

    return success(res, {
      messages: rows,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/chat/sessions
 */
const getSessions = async (req, res, next) => {
  try {
    const { sequelize } = require('../config/database');
    const sessions = await ChatLog.findAll({
      where: { user_id: req.user.id, role: 'user' },
      attributes: [
        'session_id',
        [sequelize.fn('COUNT', sequelize.col('id')), 'message_count'],
        [sequelize.fn('MIN', sequelize.col('created_at')), 'started_at'],
        [sequelize.fn('MAX', sequelize.col('created_at')), 'last_message_at'],
      ],
      group: ['session_id'],
      order: [[sequelize.fn('MAX', sequelize.col('created_at')), 'DESC']],
      raw: true,
    });

    return success(res, { sessions });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  processMessage,
  processMessageStream,
  getChatHistory,
  getSessions,
  chatValidation,
  _pendingClarifications: pendingClarifications,
  _resolveAIErrorMessage: resolveAIErrorMessage,
};
