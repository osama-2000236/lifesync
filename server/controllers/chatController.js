// server/controllers/chatController.js
// ============================================
// Chat Controller v2
// Handles NLP message processing with:
//   - Clarification state management
//   - Cross-domain linked entries
//   - Firebase real-time sync
//   - Chat history with session tracking
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
// In-Memory Clarification State
// Maps userId -> { originalMessage, clarificationQuestion, clarificationOptions, sessionId }
// In production: use Redis with TTL
// ============================================
const pendingClarifications = new Map();

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

/**
 * Resolve a category by name and domain
 * Checks user custom categories first, then defaults
 */
const resolveCategory = async (categoryName, domain, userId) => {
  if (!categoryName) return null;

  // Try exact match first, then fuzzy
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

/**
 * Create health log entries from NLP entities
 */
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

/**
 * Create financial log entries from NLP entities
 */
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

/**
 * Create cross-domain links between health and finance entries
 */
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

/**
 * Save messages to Firebase for real-time sync
 */
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
// MAIN CONTROLLER
// ============================================

/**
 * POST /api/chat
 * Process a natural language message through the NLP pipeline
 *
 * Flow:
 *   1. Check for pending clarification state
 *   2. Send to NLP service (with context if clarification)
 *   3. If needs_clarification → store state, respond with question
 *   4. If clear → create entries, link cross-domain, respond
 */
const processMessage = async (req, res, next) => {
  try {
    const { message, session_id } = req.body;
    const userId = req.user.id;
    const currentSessionId = session_id || uuidv4();

    // ─── Step 1: Check for pending clarification ───
    const pending = pendingClarifications.get(userId);
    let nlpResult;

    if (pending && pending.sessionId === currentSessionId) {
      // User is responding to a clarification question
      nlpResult = await parseMessage(message, {
        originalMessage: pending.originalMessage,
        clarificationQuestion: pending.clarificationQuestion,
        clarificationOptions: pending.clarificationOptions,
      });
      // Clear pending state regardless of outcome
      pendingClarifications.delete(userId);
    } else {
      // Fresh message
      nlpResult = await parseMessage(message);
    }

    // ─── Step 2: Handle clarification needed ───
    if (nlpResult.needs_clarification) {
      // Store clarification state
      pendingClarifications.set(userId, {
        originalMessage: message,
        clarificationQuestion: nlpResult.clarification_question,
        clarificationOptions: nlpResult.clarification_options,
        sessionId: currentSessionId,
        createdAt: Date.now(),
      });

      // Save to chat logs
      await ChatLog.create({
        user_id: userId,
        session_id: currentSessionId,
        role: 'user',
        message,
        intent: nlpResult.intent,
        entities_json: [],
        processing_time_ms: nlpResult.processing_time_ms,
      });

      await ChatLog.create({
        user_id: userId,
        session_id: currentSessionId,
        role: 'assistant',
        message: nlpResult.clarification_question,
        intent: 'clarification',
        entities_json: null,
      });

      // Sync to Firebase
      await syncToFirebase(currentSessionId, userId, message, nlpResult.clarification_question, nlpResult);

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

    // ─── Step 3: Create entries from extracted entities ───
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

      // ─── Step 4: Cross-domain linking ───
      if (nlpResult.is_cross_domain && healthEntries.length > 0 && financeEntries.length > 0) {
        linkedDomainEntries = await createCrossDomainLinks(
          healthEntries,
          financeEntries,
          nlpResult.original_message || message
        );
      }
    }

    // ─── Step 5: Save chat logs ───
    await ChatLog.create({
      user_id: userId,
      session_id: currentSessionId,
      role: 'user',
      message,
      intent: nlpResult.intent,
      entities_json: nlpResult.entities,
      processing_time_ms: nlpResult.processing_time_ms,
    });

    await ChatLog.create({
      user_id: userId,
      session_id: currentSessionId,
      role: 'assistant',
      message: nlpResult.response,
      intent: null,
      entities_json: null,
    });

    // ─── Step 6: Firebase sync ───
    await syncToFirebase(currentSessionId, userId, message, nlpResult.response, nlpResult);

    // ─── Step 7: Return response ───
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
      processing_time_ms: nlpResult.processing_time_ms,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/chat/history
 * Get chat history for current user
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
 * List all chat sessions for the user
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
  getChatHistory,
  getSessions,
  chatValidation,
  // Exported for testing
  _pendingClarifications: pendingClarifications,
};
