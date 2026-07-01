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
    // requested model deduped into the chain: 3 unique candidates
    expect(generateChat).toHaveBeenCalledTimes(FREE_FALLBACK_SLUGS.length);
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
