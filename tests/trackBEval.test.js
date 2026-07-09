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
    expect(sys).toMatch(/CROSS-DOMAIN HARNESS|CROSS-DOMAIN CURIOSITY/i);
    expect(sys).toMatch(/never invent numbers/i);
    expect(sys).toMatch(/already logged.*12/i);
    expect(sys).toMatch(/LANGUAGE LOCK|ENTIRELY in English/i);
    expect(sys).toMatch(/MEMORY TRANSFER/i);
    expect(sys).toMatch(/REAL-TIME LANGUAGE/i);
    expect(sys).toMatch(/DASHBOARD ACCESS|dashboard|LifeSync data/i);
    expect(sys).toMatch(/CURIOUS DIGGER|curious dig/i);
    expect(sys).toMatch(/LOGGING|logged to the dashboard/i);
    expect(sys).toMatch(/FINANCE HARNESS/i);
    expect(sys).toMatch(/DATA GAPS/i);
    expect(sys).toMatch(/data picture|LifeSync data/i);
  });

  test('data gaps balance health and finance; digger + finance harness always on', () => {
    const { _buildDataGaps, _buildSystemPrompt: sp } = require('../server/services/ai/conversationService');
    const empty = _buildDataGaps({});
    expect(empty.some((g) => /sleep|mood|steps|water/i.test(g))).toBe(true);
    expect(empty.some((g) => /expense|income|budget|spend/i.test(g))).toBe(true);
    const sys = sp({ health: {}, finance: {} }, [], 'en', 'm');
    expect(sys).toMatch(/DATA GAPS/i);
    expect(sys).toMatch(/expense|income|budget/i);
    expect(sys).toMatch(/CURIOUS DIGGER/);
    expect(sys).toMatch(/FINANCE HARNESS/);
    expect(sys).toMatch(/NO RE-ASK RULE|LOGGED_TODAY/i);
  });

  test('same-day: mood logged today is not a DATA GAP and is LOGGED_TODAY', () => {
    const { _buildDataGaps, _buildSystemPrompt: sp } = require('../server/services/ai/conversationService');
    const now = new Date();
    const ctx = {
      recent_health_entries: [
        { type: 'mood', value: 3, logged_at: now.toISOString() },
      ],
      recent_finance_entries: [],
      active_goals: [{ domain: 'finance', metric: 'budget' }],
      memory: { count: 1, summary: 'x' },
    };
    const gaps = _buildDataGaps(ctx, now);
    expect(gaps.join(' ')).not.toMatch(/mood/i);
    expect(gaps.some((g) => /sleep/i.test(g))).toBe(true);
    // This turn also logged sleep → both excluded
    const gaps2 = _buildDataGaps(
      { ...ctx, this_turn_entities: [{ domain: 'health', type: 'sleep' }] },
      now,
    );
    expect(gaps2.join(' ')).not.toMatch(/sleep/i);
    const sys = sp(ctx, [{ domain: 'health', type: 'mood', value: 3 }], 'en', 'openai/gpt-5.4-mini');
    expect(sys).toMatch(/LOGGED_TODAY.*mood/i);
    expect(sys).toMatch(/do NOT re-ask|NO RE-ASK/i);
  });

  test('AR system prompt uses Arabic data picture when locale is ar', () => {
    const sys = _buildSystemPrompt(
      {
        health: { sleep: { average: 6, count: 2 } },
        recent_health_entries: [{ type: 'sleep', value: 5 }],
        recent_finance_entries: [{ type: 'expense', amount: 20, currency: 'ILS', description: 'قهوة' }],
        finance: { ILS: { expense: 20, income: 0, transactions: 1, net: -20 } },
        window_days: 90,
      },
      [],
      'ar',
      'openai/gpt-5.4-mini',
    );
    expect(sys).toMatch(/صورة بياناتك|متوسط النوم|أحدث/);
    expect(sys).toMatch(/LANGUAGE LOCK.*Arabic|فصحى/i);
    expect(sys).toMatch(/عبر-المجال|CROSS-DOMAIN/i);
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
  test('context summary is vivid: averages + latest rows + XD signal', () => {
    const { _buildContextSummary } = require('../server/services/ai/bertNlpService');
    const s = _buildContextSummary({
      window_days: 90,
      health: { sleep: { average: 6.2, count: 4 }, mood: { average: 7, count: 3 } },
      finance: { ILS: { expense: 120, income: 0, transactions: 5, net: -120 } },
      recent_health_entries: [{ type: 'sleep', value: 5 }],
      recent_finance_entries: [{ type: 'expense', amount: 18, currency: 'ILS', description: 'coffee' }],
      active_goals: [{ metric: 'sleep', target: 8, domain: 'health' }],
    }, 'en');
    expect(s).toMatch(/sleep avg 6\.2/);
    expect(s).toMatch(/latest health:.*sleep 5h/);
    expect(s).toMatch(/latest money:.*18/);
    expect(s).toMatch(/CROSS-DOMAIN/);
    expect(s).toMatch(/90d|90-day/);
  });

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

describe('Track B floors — honest model candidates', () => {
  test('OpenRouter candidate list is only the user-picked slug', () => {
    const gemma = 'google/gemma-4-31b-it:free';
    const chain = _modelCandidates(gemma);
    expect(chain).toEqual([gemma]);
  });

  test('history honors full max window (cap 120) and ends with the current user turn', () => {
    const hist = Array.from({ length: 150 }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content: `m${i}`,
    }));
    const msgs = _buildMessages(hist, 'latest');
    expect(msgs[msgs.length - 1]).toEqual({ role: 'user', content: 'latest' });
    // buildBertContext windows; hard-cap 120 + current
    expect(msgs.length).toBe(121);
    expect(msgs[0].content).toBe('m30'); // dropped oldest 30 of 150
  });

  test('system prompt MAX harness prefers stored LinkedDomain count', () => {
    const sys = _buildSystemPrompt(
      {
        linked_domains: [
          { health: { type: 'sleep', value: 5 }, finance: { amount: 40, currency: 'USD', description: 'uber' } },
        ],
        source_counts: { messages: 2, health_logs: 1, finance_logs: 1, goals: 0, linked_domains: 1 },
        context_window: { mode: 'max', days: 365, messages: 120, entries: 800, links: 16 },
      },
      [],
      'en',
      'openai/gpt-5.4-mini',
    );
    expect(sys).toMatch(/CROSS-DOMAIN HARNESS \(MAX\)/);
    expect(sys).toMatch(/1 stored health↔money|linked health↔money pairs/i);
    expect(sys).toMatch(/365 days|120 chat/i);
  });

  test('genParamsForModel tightens free slugs, leaves paid roomy', () => {
    const { _genParamsForModel } = require('../server/services/ai/conversationService');
    const free = _genParamsForModel('google/gemma-4-31b-it:free');
    const paid = _genParamsForModel('openai/gpt-5.4-mini');
    expect(free.free).toBe(true);
    expect(free.maxTokens).toBeLessThan(paid.maxTokens);
    expect(free.temperature).toBeLessThanOrEqual(paid.temperature);
    expect(paid.free).toBe(false);
    expect(_buildSystemPrompt({}, [], 'en', 'google/gemma-4-31b-it:free')).toMatch(/MODEL CAPACITY \(free\)/);
    expect(_buildSystemPrompt({}, [], 'en', 'openai/gpt-5.4-mini')).toMatch(/MODEL CAPACITY \(paid/);
  });

  test('generateAssistantReply retries the same model on 429, never swaps', async () => {
    const gemma = 'google/gemma-4-31b-it:free';
    generateChat
      .mockRejectedValueOnce(new Error('429 rate-limited'))
      .mockResolvedValueOnce({ provider: 'openrouter', model: gemma, text: 'ok' });
    const out = await generateAssistantReply({
      provider: 'openrouter',
      model: gemma,
      message: 'hi',
      locale: 'en',
    });
    expect(out.text).toBe('ok');
    expect(out.model).toBe(gemma);
    expect(generateChat.mock.calls.every((c) => c[0].model === gemma)).toBe(true);
  });
});
