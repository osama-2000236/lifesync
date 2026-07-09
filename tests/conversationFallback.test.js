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
    expect(out).toEqual({ text: 'hi from gemma', provider: 'openrouter', model: GEMMA });
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
    expect(generateChat.mock.calls.every((c) => c[0].model === GEMMA)).toBe(true);
  });

  test('does NOT hop on a non-rate-limit error', async () => {
    generateChat.mockRejectedValue(HARD_FAIL);
    const out = await generateAssistantReply({
      provider: 'openrouter', model: GEMMA, message: 'hi',
    });
    expect(out).toEqual({ error: 'invalid api key' });
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
    expect(deltas.join('')).toBe('streamed reply');
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
