// tests/trackBEval.test.js
// ============================================
// Track B (generative conversation) QUALITY HARNESS — CI-gated floors.
// ============================================
// Locks system-prompt contracts, language directives, free-pool hop policy,
// and fact-grounding helpers so voice/chat conversation quality can't silently
// regress when prompts or fallback chains change.

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

const { generateChat } = require('../server/services/ai/providerClient');
const {
  generateAssistantReply,
  _buildSystemPrompt,
  _buildLanguageDirective,
  _describeLoggedFacts,
  _stripReasoning,
  _isRetryableError,
  _modelCandidates,
  _buildMessages,
} = require('../server/services/ai/conversationService');
const { FREE_FALLBACK_SLUGS } = require('../server/services/ai/modelRuntimeManager');

process.env.FREE_POOL_RETRY_MS = '0';

beforeEach(() => { generateChat.mockReset(); });

describe('Track B floors — system prompt contracts', () => {
  test('EN directive forbids third languages and asserts English only', () => {
    const d = _buildLanguageDirective('en');
    expect(d).toMatch(/ENTIRELY in English|Reply ONLY in English|LANGUAGE LOCK/i);
    expect(d).toMatch(/Chinese/);
    expect(d).toMatch(/Do NOT reply in Arabic/i);
  });

  test('AR directive asserts fluent MSA (not translationese) and real-time lock', () => {
    const d = _buildLanguageDirective('ar');
    expect(d).toMatch(/Modern Standard Arabic|فصحى/);
    expect(d).toMatch(/native phrasing/i);
    expect(d).toMatch(/Do NOT reply in English/i);
  });

  test('system prompt always includes persona, cross-domain, no-invent, model identity, memory transfer', () => {
    const sys = _buildSystemPrompt(
      {
        profile: { name: 'Sara' },
        memory: { summary: 'likes morning walks', count: 2 },
        health: { sleep: { average: 6.5, count: 3 } },
        finance: {},
      },
      [{ domain: 'finance', type: 'expense', amount: 12, currency: 'USD', description: 'coffee' }],
      'en',
      'google/gemma-4-31b-it:free',
    );
    expect(sys).toContain('LifeSync');
    expect(sys).toContain('Sara');
    expect(sys).toContain('likes morning walks');
    expect(sys).toContain('google/gemma-4-31b-it:free');
    expect(sys).toMatch(/CROSS-DOMAIN CURIOSITY/i);
    expect(sys).toMatch(/never invent numbers/i);
    expect(sys).toMatch(/already logged.*12/i);
    expect(sys).toMatch(/LANGUAGE LOCK|ENTIRELY in English/i);
    expect(sys).toMatch(/MEMORY TRANSFER/i);
    expect(sys).toMatch(/dashboard/i);
    expect(sys).toMatch(/ONE short curious question/i);
  });

  test('buildMessages prefixes a language nudge on the last user turn only', () => {
    const msgs = _buildMessages(
      [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'hi' }],
      'نمت ٤ ساعات',
      'ar',
    );
    expect(msgs).toHaveLength(3);
    expect(msgs[0].content).toBe('hello'); // history untouched
    expect(msgs[2].content).toMatch(/^أجب بالعربية فقط/);
    expect(msgs[2].content).toContain('نمت ٤ ساعات');
  });

  test('ambiguity line is present only when the logger was unclear', () => {
    const withAmb = _buildSystemPrompt({}, [], 'en', 'm', 'What was the $10 for?');
    expect(withAmb).toMatch(/ambiguous/);
    expect(withAmb).toMatch(/What was the \$10 for/);
    const clean = _buildSystemPrompt({}, [], 'en', 'm', null);
    expect(clean).not.toMatch(/ambiguous/);
  });
});

describe('Track B floors — fact grounding helpers', () => {
  test('describeLoggedFacts covers health + finance including qualitative meals', () => {
    const s = _describeLoggedFacts([
      { domain: 'finance', type: 'expense', amount: 50, currency: 'USD', description: 'dinner' },
      { domain: 'health', type: 'nutrition', unit: 'meal', value: 1, value_text: 'healthy dinner' },
      { domain: 'health', type: 'steps', value: 5000 },
    ]);
    expect(s).toMatch(/50/);
    expect(s).toMatch(/healthy dinner/);
    expect(s).not.toMatch(/1 kcal/);
    expect(s).toMatch(/5000 steps/);
  });

  test('stripReasoning drops think blocks and heuristic planning preambles', () => {
    expect(_stripReasoning('<think>plan</think>\nHello Sara')).toBe('Hello Sara');
    const planned = 'Thinking process:\n1. draft\n\nFinal answer: You slept well.';
    expect(_stripReasoning(planned)).toMatch(/slept well/i);
  });

  test('isRetryableError covers free-pool flaps only', () => {
    expect(_isRetryableError(new Error('429 rate limit'))).toBe(true);
    expect(_isRetryableError(new Error('503 overloaded'))).toBe(true);
    expect(_isRetryableError(new Error('timeout'))).toBe(true);
    expect(_isRetryableError(new Error('invalid api key'))).toBe(false);
  });
});

describe('Track B floors — free-pool candidate chain', () => {
  test('OpenRouter chain includes free fallbacks + paid last resort', () => {
    const chain = _modelCandidates(FREE_FALLBACK_SLUGS[0]);
    expect(chain[0]).toBe(FREE_FALLBACK_SLUGS[0]);
    expect(chain.length).toBeGreaterThanOrEqual(FREE_FALLBACK_SLUGS.length);
    expect(chain[chain.length - 1]).toMatch(/gpt-oss|openai\//);
  });

  test('history is capped and ends with the current user turn', () => {
    const hist = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content: `m${i}`,
    }));
    const msgs = _buildMessages(hist, 'latest');
    expect(msgs[msgs.length - 1]).toEqual({ role: 'user', content: 'latest' });
    expect(msgs.length).toBeLessThanOrEqual(21);
  });

  test('generateAssistantReply hops on 429 then returns the next model', async () => {
    generateChat
      .mockRejectedValueOnce(new Error('429 rate-limited'))
      .mockResolvedValueOnce({ provider: 'openrouter', model: FREE_FALLBACK_SLUGS[1], text: 'ok' });
    const out = await generateAssistantReply({
      provider: 'openrouter',
      model: FREE_FALLBACK_SLUGS[0],
      message: 'hi',
      locale: 'en',
    });
    expect(out.text).toBe('ok');
    expect(out.model).toBe(FREE_FALLBACK_SLUGS[1]);
  });
});
