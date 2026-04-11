// tests/chatStream.test.js
// ============================================
// SSE Streaming Chat Endpoint Tests
// POST /api/chat/stream
// ============================================

// ─── Mocks (must be declared before any require) ───

jest.mock('../server/config/firebase', () => ({
  initializeFirebase: jest.fn(),
  getFirestore: jest.fn(() => null),
}));

jest.mock('../server/config/database', () => {
  const { Sequelize } = require('sequelize');
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true,
    },
  });
  return {
    sequelize,
    testConnection: jest.fn(),
  };
});

jest.mock('../server/middleware/auth', () => ({
  authenticate: (req, _res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return _res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.',
      });
    }
    req.user = { id: 1 };
    next();
  },
  optionalAuth: (req, _res, next) => next(),
}));

jest.mock('../server/services/ai/nlpService', () => ({
  parseMessage: jest.fn(),
}));

const request = require('supertest');
const { app } = require('../server/app');
const { sequelize } = require('../server/config/database');
const { parseMessage } = require('../server/services/ai/nlpService');

// ─── Helpers ───

/**
 * Parse raw SSE text into an array of { event, data } objects.
 * Skips heartbeat comments (lines starting with ':').
 */
const parseSSE = (raw) => {
  const events = [];
  const lines = raw.split('\n');
  let currentEvent = null;
  let currentData = null;

  for (const line of lines) {
    if (line.startsWith(':')) continue; // heartbeat comment
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      currentData = line.slice(6);
    } else if (line === '' && currentEvent && currentData) {
      try {
        events.push({ event: currentEvent, data: JSON.parse(currentData) });
      } catch {
        events.push({ event: currentEvent, data: currentData });
      }
      currentEvent = null;
      currentData = null;
    }
  }
  return events;
};

// ─── Test Suite ───

describe('POST /api/chat/stream', () => {
  // ─── DB Setup ───

  beforeAll(async () => {
    // Sync all models against the in-memory SQLite database
    await sequelize.sync({ force: true });
    // Seed a test user (id=1) to satisfy FK on chat_logs.user_id
    await sequelize.query(
      "INSERT INTO users (id, username, email, verified_email, created_at, updated_at) VALUES (1, 'testuser', 'test@test.com', 1, datetime('now'), datetime('now'))"
    );
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // Truncate ChatLog between tests so counts are predictable
    const ChatLog = require('../server/models/ChatLog');
    await ChatLog.destroy({ where: {}, truncate: true });
  });

  // ─── 1. Authentication ───

  test('returns 401 without Authorization header', async () => {
    const res = await request(app)
      .post('/api/chat/stream')
      .send({ message: 'hello' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // ─── 2. Validation ───

  test('returns 400 when message is empty', async () => {
    const res = await request(app)
      .post('/api/chat/stream')
      .set('Authorization', 'Bearer fake-token')
      .send({ message: '' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/validation/i);
  });

  test('returns 400 when message field is missing', async () => {
    const res = await request(app)
      .post('/api/chat/stream')
      .set('Authorization', 'Bearer fake-token')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // ─── 3. SSE Content-Type ───

  test('returns Content-Type text/event-stream on success', async () => {
    parseMessage.mockResolvedValue({
      success: true,
      intent: 'log_health',
      domain: 'health',
      entities: [],
      response: 'Got it!',
      needs_clarification: false,
      confidence: 0.9,
      is_cross_domain: false,
      processing_time_ms: 50,
    });

    const res = await request(app)
      .post('/api/chat/stream')
      .set('Authorization', 'Bearer fake-token')
      .send({ message: 'I walked 5000 steps' });

    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
  });

  // ─── 4. Optimistic DB write + full SSE lifecycle ───

  test('emits ack then complete events on successful parse', async () => {
    parseMessage.mockResolvedValue({
      success: true,
      intent: 'log_health',
      domain: 'health',
      entities: [
        { domain: 'health', type: 'steps', value: 8000, unit: 'steps', category: 'Steps' },
      ],
      response: 'Logged 8,000 steps!',
      needs_clarification: false,
      confidence: 0.95,
      is_cross_domain: false,
      processing_time_ms: 120,
    });

    const res = await request(app)
      .post('/api/chat/stream')
      .set('Authorization', 'Bearer fake-token')
      .send({ message: 'I walked 8000 steps' });

    const events = parseSSE(res.text);
    const eventNames = events.map((e) => e.event);

    // Must see ack before complete, and done at the end
    expect(eventNames).toContain('ack');
    expect(eventNames).toContain('complete');
    expect(eventNames).toContain('done');
    expect(eventNames.indexOf('ack')).toBeLessThan(eventNames.indexOf('complete'));
    expect(eventNames.indexOf('complete')).toBeLessThan(eventNames.indexOf('done'));

    // Verify ack payload
    const ack = events.find((e) => e.event === 'ack');
    expect(ack.data.session_id).toBeDefined();
    expect(ack.data.user_message_id).toBeDefined();
    expect(ack.data.assistant_message_id).toBeDefined();

    // Verify complete payload
    const complete = events.find((e) => e.event === 'complete');
    expect(complete.data.intent).toBe('log_health');
    expect(complete.data.confidence).toBe(0.95);
  });

  // ─── 5. Error handling — AI service failure ───

  test('emits error event when parseMessage throws', async () => {
    parseMessage.mockRejectedValue(new Error('HuggingFace timeout'));

    const res = await request(app)
      .post('/api/chat/stream')
      .set('Authorization', 'Bearer fake-token')
      .send({ message: 'I ran 5 miles' });

    const events = parseSSE(res.text);
    const eventNames = events.map((e) => e.event);

    expect(eventNames).toContain('ack');
    expect(eventNames).toContain('error');
    expect(eventNames).toContain('done');

    const errorEvt = events.find((e) => e.event === 'error');
    expect(errorEvt.data.retryable).toBe(true);
    expect(errorEvt.data.message).toBeDefined();
  });

  // ─── 6. Persists error state to DB ───

  test('persists error status to ChatLog rows when AI fails', async () => {
    parseMessage.mockRejectedValue(new Error('Service unavailable'));

    await request(app)
      .post('/api/chat/stream')
      .set('Authorization', 'Bearer fake-token')
      .send({ message: 'log something' });

    // Query the ChatLog table for rows created in this request
    const ChatLog = require('../server/models/ChatLog');
    const rows = await ChatLog.findAll({ where: { user_id: 1 }, order: [['id', 'ASC']] });

    // Should have 2 rows: user message + assistant message
    expect(rows.length).toBe(2);

    const userRow = rows.find((r) => r.role === 'user');
    const assistantRow = rows.find((r) => r.role === 'assistant');

    expect(userRow).toBeDefined();
    expect(assistantRow).toBeDefined();

    // User row should be marked complete, assistant row should be error
    expect(userRow.status).toBe('complete');
    expect(assistantRow.status).toBe('error');
    expect(assistantRow.intent).toBe('error');
  });

  // ─── 7. Optimistic DB writes — rows exist BEFORE AI completes ───

  test('user message and pending assistant row exist in DB before parseMessage resolves', async () => {
    const ChatLog = require('../server/models/ChatLog');
    let rowsDuringInference = null;

    // Mock parseMessage so it captures DB state WHILE the AI is "thinking"
    parseMessage.mockImplementation(async () => {
      // Snapshot the DB mid-flight — before we return any result
      rowsDuringInference = await ChatLog.findAll({
        where: { user_id: 1 },
        order: [['id', 'ASC']],
      });

      return {
        success: true,
        intent: 'log_health',
        domain: 'health',
        entities: [
          { domain: 'health', type: 'steps', value: 3000, unit: 'steps', category: 'Steps' },
        ],
        response: 'Logged 3,000 steps!',
        needs_clarification: false,
        confidence: 0.88,
        is_cross_domain: false,
        processing_time_ms: 200,
      };
    });

    await request(app)
      .post('/api/chat/stream')
      .set('Authorization', 'Bearer fake-token')
      .send({ message: 'I walked 3000 steps' });

    // Verify the snapshot taken DURING inference
    expect(rowsDuringInference).not.toBeNull();
    expect(rowsDuringInference.length).toBe(2);

    const userRow = rowsDuringInference.find((r) => r.role === 'user');
    const assistantRow = rowsDuringInference.find((r) => r.role === 'assistant');

    // User message should already be persisted with status 'sent'
    expect(userRow).toBeDefined();
    expect(userRow.message).toBe('I walked 3000 steps');
    expect(userRow.status).toBe('sent');

    // Assistant placeholder should exist with status 'pending'
    expect(assistantRow).toBeDefined();
    expect(assistantRow.status).toBe('pending');
    expect(assistantRow.message).toBe('');
  });
});
