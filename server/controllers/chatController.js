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

const { body } = require('express-validator');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const { parseMessage } = require('../services/ai/nlpService');
const HealthLog = require('../models/HealthLog');
const FinancialLog = require('../models/FinancialLog');
const Category = require('../models/Category');
const ChatLog = require('../models/ChatLog');
const LinkedDomain = require('../models/LinkedDomain');
const { getFirestore } = require('../config/firebase');
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
// In-Memory Clarification State
// ============================================
const pendingClarifications = new Map();

// TTL cleanup: evict stale clarification state every 60s (5-min TTL)
const CLARIFICATION_TTL_MS = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [userId, state] of pendingClarifications) {
    if (now - state.createdAt > CLARIFICATION_TTL_MS) {
      pendingClarifications.delete(userId);
    }
  }
}, 60_000);

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
];

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
  const links = [];
  for (const hEntry of healthEntries) {
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
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
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
  const currentSessionId = session_id || uuidv4();

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
    });

    // ─── Step 2: Check for pending clarification ───
    const pending = pendingClarifications.get(userId);
    let nlpResult;

    // Fetch recent conversation turns for context (last 10 messages in this session)
    const recentHistory = await ChatLog.findAll({
      where: { user_id: userId, session_id: currentSessionId },
      order: [['created_at', 'DESC']],
      limit: 10,
      raw: true,
    });
    const conversationHistory = recentHistory.reverse();

    // Heartbeat interval to keep the connection alive during HF inference
    const heartbeat = setInterval(() => {
      res.write(':heartbeat\n\n');
    }, 15_000);

    try {
      if (pending && pending.sessionId === currentSessionId) {
        nlpResult = await parseMessage(message, {
          originalMessage: pending.originalMessage,
          clarificationQuestion: pending.clarificationQuestion,
          clarificationOptions: pending.clarificationOptions,
        }, conversationHistory);
        pendingClarifications.delete(userId);
      } else {
        // Fresh message — call HF Space (this is the slow part)
        sseWrite(res, 'status', { message: 'Processing your message...' });
        nlpResult = await parseMessage(message, null, conversationHistory);
      }
    } catch (aiError) {
      clearInterval(heartbeat);

      // ─── AI Failed — persist error state to DB ───
      await safeUpdate(userChatLog, { intent: 'unclear', status: 'complete' });
      await safeUpdate(assistantChatLog, {
        message: 'Sorry, the AI service is temporarily unavailable. Your message has been saved and you can try again shortly.',
        intent: 'error',
        status: 'error',
      });

      sseWrite(res, 'error', {
        session_id: currentSessionId,
        message: 'AI service temporarily unavailable. Your message was saved.',
        retryable: true,
      });
      sseWrite(res, 'done', {});
      return res.end();
    }

    clearInterval(heartbeat);

    // ─── Step 3: Handle clarification needed ───
    if (nlpResult.needs_clarification) {
      pendingClarifications.set(userId, {
        originalMessage: message,
        clarificationQuestion: nlpResult.clarification_question,
        clarificationOptions: nlpResult.clarification_options,
        sessionId: currentSessionId,
        createdAt: Date.now(),
      });

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

    // ─── Step 4b: Resolve query intents with real user data ───
    let finalResponse = nlpResult.response;
    if (nlpResult.intent === 'query_health') {
      try {
        const recentHealth = await HealthLog.findAll({
          where: { user_id: userId },
          order: [['logged_at', 'DESC']],
          limit: 7,
          raw: true,
        });
        if (recentHealth.length > 0) {
          const summary = recentHealth.map((h) =>
            `${h.type}: ${h.value}${h.unit ? ' ' + h.unit : ''} (${new Date(h.logged_at).toLocaleDateString()})`
          ).join(', ');
          finalResponse = `${nlpResult.response} Your recent entries: ${summary}.`;
        }
      } catch { /* non-critical — use AI response as fallback */ }
    } else if (nlpResult.intent === 'query_finance') {
      try {
        const recentFinance = await FinancialLog.findAll({
          where: { user_id: userId },
          order: [['logged_at', 'DESC']],
          limit: 7,
          raw: true,
        });
        if (recentFinance.length > 0) {
          const summary = recentFinance.map((f) =>
            `${f.type} $${Number(f.amount).toFixed(2)} (${new Date(f.logged_at).toLocaleDateString()})`
          ).join(', ');
          finalResponse = `${nlpResult.response} Your recent entries: ${summary}.`;
        }
      } catch { /* non-critical — use AI response as fallback */ }
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
      message: finalResponse,
      intent: null,
      entities_json: null,
      status: 'complete',
    });

    // ─── Step 6: Firebase sync (non-blocking) ───
    syncToFirebase(currentSessionId, userId, message, finalResponse, nlpResult).catch(() => {});

    // ─── Step 7: Send complete event ───
    sseWrite(res, 'complete', {
      session_id: currentSessionId,
      intent: nlpResult.intent,
      domain: nlpResult.domain,
      response: finalResponse,
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
    const currentSessionId = session_id || uuidv4();

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
    const pending = pendingClarifications.get(userId);
    let nlpResult;

    // Fetch recent conversation turns for context
    const recentHistoryJson = await ChatLog.findAll({
      where: { user_id: userId, session_id: currentSessionId },
      order: [['created_at', 'DESC']],
      limit: 10,
      raw: true,
    });
    const conversationHistoryJson = recentHistoryJson.reverse();

    try {
      if (pending && pending.sessionId === currentSessionId) {
        nlpResult = await parseMessage(message, {
          originalMessage: pending.originalMessage,
          clarificationQuestion: pending.clarificationQuestion,
          clarificationOptions: pending.clarificationOptions,
        }, conversationHistoryJson);
        pendingClarifications.delete(userId);
      } else {
        nlpResult = await parseMessage(message, null, conversationHistoryJson);
      }
    } catch (aiError) {
      // AI failed — persist error state, still return a response
      await safeUpdate(userChatLog, { intent: 'unclear', status: 'complete' });
      await safeUpdate(assistantChatLog, {
        message: 'Sorry, the AI service is temporarily unavailable. Your message has been saved.',
        intent: 'error',
        status: 'error',
      });

      return success(res, {
        session_id: currentSessionId,
        intent: 'error',
        domain: 'general',
        response: 'Sorry, the AI service is temporarily unavailable. Your message has been saved and you can try again shortly.',
        needs_clarification: false,
        confidence: 0,
        entities_logged: { health: [], finance: [], linked: [] },
        processing_time_ms: 0,
        error: true,
      });
    }

    // ─── Handle clarification ───
    if (nlpResult.needs_clarification) {
      pendingClarifications.set(userId, {
        originalMessage: message,
        clarificationQuestion: nlpResult.clarification_question,
        clarificationOptions: nlpResult.clarification_options,
        sessionId: currentSessionId,
        createdAt: Date.now(),
      });

      await safeUpdate(userChatLog, {
        intent: nlpResult.intent,
        entities_json: [],
        processing_time_ms: nlpResult.processing_time_ms,
        status: 'complete',
      });
      await safeUpdate(assistantChatLog, {
        message: nlpResult.clarification_question,
        intent: 'clarification',
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

    // ─── Resolve query intents with real data ───
    let finalResponseJson = nlpResult.response;
    if (nlpResult.intent === 'query_health') {
      try {
        const recentHealth = await HealthLog.findAll({
          where: { user_id: userId },
          order: [['logged_at', 'DESC']],
          limit: 7,
          raw: true,
        });
        if (recentHealth.length > 0) {
          const summary = recentHealth.map((h) =>
            `${h.type}: ${h.value}${h.unit ? ' ' + h.unit : ''} (${new Date(h.logged_at).toLocaleDateString()})`
          ).join(', ');
          finalResponseJson = `${nlpResult.response} Your recent entries: ${summary}.`;
        }
      } catch { /* non-critical */ }
    } else if (nlpResult.intent === 'query_finance') {
      try {
        const recentFinance = await FinancialLog.findAll({
          where: { user_id: userId },
          order: [['logged_at', 'DESC']],
          limit: 7,
          raw: true,
        });
        if (recentFinance.length > 0) {
          const summary = recentFinance.map((f) =>
            `${f.type} $${Number(f.amount).toFixed(2)} (${new Date(f.logged_at).toLocaleDateString()})`
          ).join(', ');
          finalResponseJson = `${nlpResult.response} Your recent entries: ${summary}.`;
        }
      } catch { /* non-critical */ }
    }

    // ─── Finalize chat logs ───
    await safeUpdate(userChatLog, {
      intent: nlpResult.intent,
      entities_json: nlpResult.entities,
      processing_time_ms: nlpResult.processing_time_ms,
      status: 'complete',
    });
    await safeUpdate(assistantChatLog, {
      message: finalResponseJson,
      intent: null,
      entities_json: null,
      status: 'complete',
    });

    syncToFirebase(currentSessionId, userId, message, finalResponseJson, nlpResult).catch(() => {});

    return success(res, {
      session_id: currentSessionId,
      intent: nlpResult.intent,
      domain: nlpResult.domain,
      response: finalResponseJson,
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
    const { session_id, page = 1, limit = 50 } = req.query;
    const where = { user_id: req.user.id };
    if (session_id) where.session_id = session_id;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await ChatLog.findAndCountAll({
      where,
      order: [['created_at', 'ASC']],
      limit: parseInt(limit),
      offset,
    });

    return success(res, {
      messages: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        totalPages: Math.ceil(count / parseInt(limit)),
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
        // First message in the session as a preview label
        [sequelize.fn('MIN', sequelize.col('message')), 'preview'],
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
};
