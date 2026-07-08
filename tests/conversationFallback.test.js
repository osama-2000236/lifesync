// tests/conversationFallback.test.js
// ============================================
// Free-model resilience: OpenRouter :free pools intermittently 429 — the
// conversation service must hop to the next verified free model instead of
// dropping to the deterministic template reply.
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
} = require('../server/services/ai/conversationService');
const { FREE_FALLBACK_SLUGS } = require('../server/services/ai/modelRuntimeManager');

const RATE_LIMIT = new Error('Provider returned error: 429 rate-limited upstream');
const HARD_FAIL = new Error('invalid api key');

// No real backoff sleeps in tests — retry passes fire instantly.
process.env.FREE_POOL_RETRY_MS = '0';

beforeEach(() => {
  generateChat.mockReset();
  generateChatStream.mockReset();
});

describe('system prompt', () => {
  test('names the powering model honestly and keeps the cross-domain directive', () => {
    const sys = _buildSystemPrompt({}, [], 'en', 'google/gemma-4-31b-it:free');
    expect(sys).toContain('google/gemma-4-31b-it:free');
    expect(sys).toMatch(/CROSS-DOMAIN/);
  });

  test('omits the identity line when no model slug is known', () => {
    const sys = _buildSystemPrompt({}, [], 'en', null);
    expect(sys).not.toContain('powered by');
  });
});

describe('generateAssistantReply free fallback', () => {
  test('hops to the next free model on a 429 and returns its reply', async () => {
    generateChat
      .mockRejectedValueOnce(RATE_LIMIT)
      .mockResolvedValueOnce({ provider: 'openrouter', model: FREE_FALLBACK_SLUGS[1], text: 'hopped reply' });

    const out = await generateAssistantReply({
      provider: 'openrouter',
      model: FREE_FALLBACK_SLUGS[0],
      message: 'hi',
    });

    expect(out).toEqual({ text: 'hopped reply', provider: 'openrouter', model: FREE_FALLBACK_SLUGS[1] });
    expect(generateChat).toHaveBeenCalledTimes(2);
    expect(generateChat.mock.calls[1][0].model).toBe(FREE_FALLBACK_SLUGS[1]);
  });

  test('does NOT hop on a non-rate-limit error', async () => {
    generateChat.mockRejectedValueOnce(HARD_FAIL);
    const out = await generateAssistantReply({ provider: 'openrouter', model: 'x/y:free', message: 'hi' });
    expect(out).toEqual({ error: 'invalid api key' });
    expect(generateChat).toHaveBeenCalledTimes(1);
  });

  test('hops on a 503 busy pool (not just 429)', async () => {
    generateChat
      .mockRejectedValueOnce(new Error('Request failed with status code 503'))
      .mockResolvedValueOnce({ provider: 'openrouter', model: FREE_FALLBACK_SLUGS[1], text: 'ok' });
    const out = await generateAssistantReply({
      provider: 'openrouter', model: FREE_FALLBACK_SLUGS[0], message: 'hi',
    });
    expect(out.text).toBe('ok');
    expect(generateChat).toHaveBeenCalledTimes(2);
  });

  test('hops when a free pool returns an empty completion', async () => {
    generateChat
      .mockResolvedValueOnce({ provider: 'openrouter', model: FREE_FALLBACK_SLUGS[0], text: '   ' })
      .mockResolvedValueOnce({ provider: 'openrouter', model: FREE_FALLBACK_SLUGS[1], text: 'real reply' });
    const out = await generateAssistantReply({
      provider: 'openrouter', model: FREE_FALLBACK_SLUGS[0], message: 'hi',
    });
    expect(out.text).toBe('real reply');
    expect(generateChat).toHaveBeenCalledTimes(2);
  });

  test('does NOT build a candidate chain for non-OpenRouter providers', async () => {
    generateChat.mockRejectedValueOnce(RATE_LIMIT);
    const out = await generateAssistantReply({ provider: 'anthropic', model: 'claude-x', message: 'hi' });
    expect(out.error).toMatch(/429/);
    expect(generateChat).toHaveBeenCalledTimes(1);
  });

  test('surfaces the last error when every free candidate is rate-limited', async () => {
    generateChat.mockRejectedValue(RATE_LIMIT);
    const out = await generateAssistantReply({
      provider: 'openrouter',
      model: FREE_FALLBACK_SLUGS[0],
      message: 'hi',
    });
    expect(out.error).toMatch(/429/);
    // chain = 3 unique free candidates + 1 paid last resort = 4, retried for a
    // second pass (default FREE_POOL_PASSES=2) to ride out a :free flap.
    expect(generateChat).toHaveBeenCalledTimes((FREE_FALLBACK_SLUGS.length + 1) * 2);
  });

  test('spills to the paid model only after every free candidate 429s', async () => {
    // All free pools busy; the paid last-resort answers.
    for (let i = 0; i < FREE_FALLBACK_SLUGS.length; i++) generateChat.mockRejectedValueOnce(RATE_LIMIT);
    generateChat.mockResolvedValueOnce({ provider: 'openrouter', model: 'openai/gpt-oss-120b', text: 'paid reply' });

    const out = await generateAssistantReply({
      provider: 'openrouter', model: FREE_FALLBACK_SLUGS[0], message: 'hi',
    });
    expect(out).toEqual({ text: 'paid reply', provider: 'openrouter', model: 'openai/gpt-oss-120b' });
    // paid is LAST: reached only on the 4th call, after the 3 free ones failed.
    expect(generateChat).toHaveBeenCalledTimes(FREE_FALLBACK_SLUGS.length + 1);
    expect(generateChat.mock.calls[FREE_FALLBACK_SLUGS.length][0].model).toBe('openai/gpt-oss-120b');
  });
});

describe('free-pool flap retry (whole chain 429, then clears)', () => {
  const OLD = process.env.FREE_POOL_RETRY_MS;
  beforeAll(() => { process.env.FREE_POOL_RETRY_MS = '0'; });
  afterAll(() => { process.env.FREE_POOL_RETRY_MS = OLD; });

  test('retries the whole chain after a full 429 pass and succeeds', async () => {
    // Every candidate (3 free + 1 paid) 429 on pass 1, then pass 2 clears.
    const total = FREE_FALLBACK_SLUGS.length + 1; // + paid last resort
    for (let i = 0; i < total; i++) generateChat.mockRejectedValueOnce(RATE_LIMIT);
    generateChat.mockResolvedValueOnce({ provider: 'openrouter', model: FREE_FALLBACK_SLUGS[0], text: 'cleared' });

    const out = await generateAssistantReply({
      provider: 'openrouter', model: FREE_FALLBACK_SLUGS[0], message: 'hi',
    });
    expect(out.text).toBe('cleared');
    expect(generateChat).toHaveBeenCalledTimes(total + 1); // one full failed pass + one retry hit
  });

  test('does NOT retry a hard error (bad key) — no wasted second pass', async () => {
    generateChat.mockRejectedValue(HARD_FAIL);
    const out = await generateAssistantReply({
      provider: 'openrouter', model: FREE_FALLBACK_SLUGS[0], message: 'hi',
    });
    expect(out).toEqual({ error: 'invalid api key' });
    expect(generateChat).toHaveBeenCalledTimes(1); // stops on first candidate, no retry pass
  });
});

describe('generateAssistantReplyStream free fallback', () => {
  test('hops on 429 when nothing streamed yet', async () => {
    generateChatStream
      .mockRejectedValueOnce(RATE_LIMIT)
      .mockImplementationOnce(async ({ onDelta }) => {
        onDelta('streamed ');
        onDelta('reply');
        return { provider: 'openrouter', model: FREE_FALLBACK_SLUGS[1], text: 'streamed reply' };
      });

    const deltas = [];
    const out = await generateAssistantReplyStream({
      provider: 'openrouter',
      model: FREE_FALLBACK_SLUGS[0],
      message: 'hi',
      onDelta: (d) => deltas.push(d),
    });

    expect(out.text).toBe('streamed reply');
    expect(deltas.join('')).toBe('streamed reply');
    expect(generateChatStream).toHaveBeenCalledTimes(2);
  });

  test('does NOT hop after tokens already reached the client', async () => {
    generateChatStream.mockImplementationOnce(async ({ onDelta }) => {
      onDelta('partial…');
      throw RATE_LIMIT;
    });

    const out = await generateAssistantReplyStream({
      provider: 'openrouter',
      model: FREE_FALLBACK_SLUGS[0],
      message: 'hi',
      onDelta: () => {},
    });

    expect(out.error).toMatch(/429/);
    expect(generateChatStream).toHaveBeenCalledTimes(1);
  });

  test('does NOT hop when the caller aborted (voice barge-in)', async () => {
    generateChatStream.mockRejectedValueOnce(RATE_LIMIT);
    const out = await generateAssistantReplyStream({
      provider: 'openrouter',
      model: FREE_FALLBACK_SLUGS[0],
      message: 'hi',
      signal: { aborted: true },
      onDelta: () => {},
    });
    expect(out.error).toMatch(/429/);
    expect(generateChatStream).toHaveBeenCalledTimes(1);
  });
});
