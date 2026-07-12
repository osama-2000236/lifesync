// tests/conversationFallback.test.js
// ============================================
// Honest model binding: the user-picked OpenRouter slug is the ONLY model
// called. Free pools may 429 — we retry the same slug (and non-stream for
// voice free), never hop Gemma → gpt-oss or free → paid.
// ============================================
jest.mock('../server/services/ai/providerClient', () => ({
  generateChat: jest.fn(),
  generateChatStream: jest.fn(),
  getAIProviderStatus: jest.fn(),
  _getProvider: jest.fn(() => 'openrouter'),
  _getProviderSettings: jest.fn(() => ({})),
  _setRuntimeProvider: jest.fn(),
  _setRuntimeModel: jest.fn(),
  _clearRuntimeModel: jest.fn(),
}));

const { generateChat, generateChatStream } = require('../server/services/ai/providerClient');
const {
  generateAssistantReply,
  generateAssistantReplyStream,
  _buildSystemPrompt,
  _modelCandidates,
  _isRetryableError,
  _capContextBudget,
} = require('../server/services/ai/conversationService');

const RATE_LIMIT = new Error('Provider returned error: 429 rate-limited upstream');
const HARD_FAIL = new Error('invalid api key');
const GEMMA = 'google/gemma-4-31b-it:free';
const GPT = 'openai/gpt-5.4-mini';

// No real backoff sleeps in tests — retry passes fire instantly.
process.env.FREE_POOL_RETRY_MS = '0';

beforeEach(() => {
  generateChat.mockReset();
  generateChatStream.mockReset();
});

describe('system prompt', () => {
  test('names the powering model honestly and keeps the cross-domain directive', () => {
    const sys = _buildSystemPrompt({}, [], 'en', GEMMA);
    expect(sys).toContain(GEMMA);
    expect(sys).toMatch(/CROSS-DOMAIN/);
  });

  test('omits the identity line when no model slug is known', () => {
    const sys = _buildSystemPrompt({}, [], 'en', null);
    expect(sys).not.toContain('powered by');
  });
});

describe('honest model candidates (no silent swap)', () => {
  test('free pick is only that free slug', () => {
    expect(_modelCandidates(GEMMA)).toEqual([GEMMA]);
  });

  test('paid pick is only that paid slug', () => {
    expect(_modelCandidates(GPT)).toEqual([GPT]);
  });
});

describe('generateAssistantReply same-slug only', () => {
  test('returns the reply from the picked model', async () => {
    generateChat.mockResolvedValueOnce({ provider: 'openrouter', model: GEMMA, text: 'hi from gemma' });
    const out = await generateAssistantReply({
      provider: 'openrouter', model: GEMMA, message: 'hi',
    });
    expect(out).toEqual({
      text: 'hi from gemma', provider: 'openrouter', model: GEMMA,
      path: 'nonstream', attempts: 1, latency_ms: expect.any(Number),
    });
    expect(generateChat).toHaveBeenCalledTimes(1);
    expect(generateChat.mock.calls[0][0].model).toBe(GEMMA);
  });

  test('retries the SAME free model on 429, never hops', async () => {
    generateChat
      .mockRejectedValueOnce(RATE_LIMIT)
      .mockResolvedValueOnce({ provider: 'openrouter', model: GEMMA, text: 'cleared' });
    const out = await generateAssistantReply({
      provider: 'openrouter', model: GEMMA, message: 'hi',
    });
    expect(out.text).toBe('cleared');
    expect(out.model).toBe(GEMMA);
    expect(out.attempts).toBe(2); // free-pool retry is visible in diagnostics
    expect(generateChat.mock.calls.every((c) => c[0].model === GEMMA)).toBe(true);
  });

  test('does NOT hop on a non-rate-limit error', async () => {
    generateChat.mockRejectedValue(HARD_FAIL);
    const out = await generateAssistantReply({
      provider: 'openrouter', model: GEMMA, message: 'hi',
    });
    expect(out).toEqual({ error: 'invalid api key', attempts: 1, latency_ms: expect.any(Number) });
    expect(generateChat).toHaveBeenCalledTimes(1);
  });

  test('does NOT build a multi-model chain for OpenRouter', async () => {
    generateChat.mockRejectedValue(RATE_LIMIT);
    await generateAssistantReply({
      provider: 'openrouter', model: GEMMA, message: 'hi',
    });
    // Only same-slug retries (default 2 passes × 1 candidate)
    expect(generateChat.mock.calls.every((c) => c[0].model === GEMMA)).toBe(true);
    expect(generateChat.mock.calls.some((c) => String(c[0].model).includes('gpt-oss'))).toBe(false);
  });

  test('non-OpenRouter providers stay single-shot on the picked model', async () => {
    generateChat.mockResolvedValueOnce({ provider: 'ollama', model: 'local', text: 'ok' });
    const out = await generateAssistantReply({
      provider: 'ollama', model: 'local', message: 'hi',
    });
    expect(out.model).toBe('local');
    expect(generateChat).toHaveBeenCalledTimes(1);
  });
});

describe('generateAssistantReplyStream free voice path', () => {
  test('free models try non-stream first on the same free slug', async () => {
    generateChat.mockResolvedValueOnce({
      provider: 'openrouter',
      model: GEMMA,
      text: 'nonstream free ok',
    });

    const deltas = [];
    const out = await generateAssistantReplyStream({
      provider: 'openrouter',
      model: GEMMA,
      message: 'hi',
      onDelta: (d) => deltas.push(d),
    });

    expect(out).toEqual({
      text: 'nonstream free ok',
      provider: 'openrouter',
      model: GEMMA,
      path: 'nonstream',
      attempts: 1,
      latency_ms: expect.any(Number),
    });
    expect(deltas.join('')).toBe('nonstream free ok');
    expect(generateChat).toHaveBeenCalledTimes(1);
    expect(generateChatStream).not.toHaveBeenCalled();
  });

  test('stream fallback still uses the same free slug only', async () => {
    generateChat.mockRejectedValueOnce(RATE_LIMIT);
    generateChatStream.mockImplementationOnce(async ({ onDelta }) => {
      onDelta('streamed reply');
      return { provider: 'openrouter', model: GEMMA, text: 'streamed reply' };
    });

    const deltas = [];
    const out = await generateAssistantReplyStream({
      provider: 'openrouter',
      model: GEMMA,
      message: 'hi',
      onDelta: (d) => deltas.push(d),
    });

    expect(out.text).toBe('streamed reply');
    expect(out.model).toBe(GEMMA);
    expect(out.path).toBe('stream');
    expect(deltas.join('')).toBe('streamed reply');
  });

  test('pre-token stream stall retries the same slug instead of hard-stopping', async () => {
    // Live failure shape: free pool accepts the stream then goes silent — the
    // stall watchdog rejects with retryable:true but a message the old regex
    // never matched, hard-stopping a turn the next pass would have saved.
    const stall = new Error('openrouter stream stalled — no tokens for 12s');
    stall.retryable = true;
    generateChat
      .mockRejectedValueOnce(RATE_LIMIT) // pass 1 non-stream busy
      .mockResolvedValueOnce({ provider: 'openrouter', model: GEMMA, text: 'recovered' }); // pass 2
    generateChatStream.mockRejectedValueOnce(stall); // pass 1 stream stalls pre-token

    const out = await generateAssistantReplyStream({
      provider: 'openrouter', model: GEMMA, message: 'hi',
    });
    expect(out.text).toBe('recovered');
    expect(out.path).toBe('nonstream');
    expect(out.attempts).toBe(3);
    expect(generateChat.mock.calls.every((c) => c[0].model === GEMMA)).toBe(true);
  });

  test('provider-classified retryable flags are honored; 529 counts as busy', () => {
    const stall = new Error('totally unmatchable message');
    stall.retryable = true;
    expect(_isRetryableError(stall)).toBe(true);
    expect(_isRetryableError(new Error('anthropic request failed (529)'))).toBe(true);
    expect(_isRetryableError(new Error('invalid api key'))).toBe(false);
  });

  test('wall-clock retry budget bounds the passes (FREE_RETRY_BUDGET_MS=0 → single pass)', async () => {
    process.env.FREE_RETRY_BUDGET_MS = '0';
    try {
      generateChat.mockRejectedValue(RATE_LIMIT);
      const out = await generateAssistantReply({ provider: 'openrouter', model: GEMMA, message: 'hi' });
      expect(out.error).toBeTruthy();
      expect(generateChat).toHaveBeenCalledTimes(1); // second pass skipped by budget
    } finally {
      delete process.env.FREE_RETRY_BUDGET_MS;
    }
  });

  test('does NOT hop after tokens already reached the client', async () => {
    generateChat.mockRejectedValueOnce(RATE_LIMIT);
    generateChatStream.mockImplementationOnce(async ({ onDelta }) => {
      onDelta('partial…');
      throw RATE_LIMIT;
    });

    const out = await generateAssistantReplyStream({
      provider: 'openrouter',
      model: GEMMA,
      message: 'hi',
      onDelta: () => {},
    });

    expect(out.error).toMatch(/429/);
  });

  test('does NOT call providers when the caller aborted (voice barge-in)', async () => {
    const out = await generateAssistantReplyStream({
      provider: 'openrouter',
      model: GEMMA,
      message: 'hi',
      signal: { aborted: true },
      onDelta: () => {},
    });
    expect(out.error).toBeTruthy();
    expect(generateChat).not.toHaveBeenCalled();
    expect(generateChatStream).not.toHaveBeenCalled();
  });
});

describe('context char budget (cap before any cloud call)', () => {
  test('oversized context shrinks under the cap: oldest history first, memory untouched', () => {
    process.env.CHAT_CONTEXT_CHAR_BUDGET = '5000';
    try {
      const context = {
        memory: { summary: 'name is Osama; vegetarian', count: 2 },
        conversation: Array.from({ length: 100 }, (_, i) => ({
          role: i % 2 ? 'assistant' : 'user',
          content: `turn-${i} ${'x'.repeat(200)}`,
        })),
      };
      const capped = _capContextBudget(context);
      expect(JSON.stringify(capped).length).toBeLessThanOrEqual(5000);
      // Memory is the product — never dropped to make room.
      expect(capped.memory.summary).toBe('name is Osama; vegetarian');
      // Newest turns survive; oldest were dropped.
      expect(capped.conversation[capped.conversation.length - 1].content).toContain('turn-99');
      expect(capped.conversation.length).toBeGreaterThanOrEqual(4);
      expect(capped.conversation.length).toBeLessThan(100);
      // Caller's context object is not mutated.
      expect(context.conversation).toHaveLength(100);
    } finally {
      delete process.env.CHAT_CONTEXT_CHAR_BUDGET;
    }
  });

  test('context under the budget passes through untouched (same reference)', () => {
    const ctx = { conversation: [{ role: 'user', content: 'hi' }], memory: { summary: 's' } };
    expect(_capContextBudget(ctx)).toBe(ctx);
  });

  test('capContextBudget stringifies O(log n) not O(n) relative to history length', () => {
    process.env.CHAT_CONTEXT_CHAR_BUDGET = '8000';
    const orig = JSON.stringify;
    let count = 0;
    // eslint-disable-next-line no-extend-native
    JSON.stringify = (...args) => {
      count += 1;
      return orig(...args);
    };
    try {
      const context = {
        memory: { summary: 'keep me' },
        conversation: Array.from({ length: 80 }, (_, i) => ({
          role: i % 2 ? 'assistant' : 'user',
          content: `t${i} ${'y'.repeat(150)}`,
        })),
      };
      const capped = _capContextBudget(context);
      expect(JSON.stringify(capped).length).toBeLessThanOrEqual(8000);
      // Linear shift re-measure would be ~80+; binary search stays well under 40.
      expect(count).toBeLessThan(40);
      expect(capped.memory.summary).toBe('keep me');
    } finally {
      JSON.stringify = orig;
      delete process.env.CHAT_CONTEXT_CHAR_BUDGET;
    }
  });
});
