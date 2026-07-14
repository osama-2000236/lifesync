// tests/voiceTrioEval.test.js
// ============================================
// Voice trio harness — the three models a user may pick for voice/chat,
// pricing truth, free-vs-paid hop policy, language locks, XD curiosity.
// ============================================

const mrm = require('../server/services/ai/modelRuntimeManager');
const {
  _buildSystemPrompt,
  _buildLanguageDirective,
  _buildMessages,
  _modelCandidates,
} = require('../server/services/ai/conversationService');
const { _detectLang: detectLang } = require('../server/services/ai/nlpService');
const {
  assistantModelMeta,
  _readCatalogModel,
} = require('../server/services/ai/sessionModelLock');

const VOICE_TRIO = ['openai_chat', 'openrouter_chat', 'gemma4_local'];

describe('voice trio catalog (facts from resolveModel)', () => {
  test('exactly three voice_ok models in the catalog trio ids', () => {
    const cat = mrm.getModelCatalog();
    const voice = cat.filter((m) => m.voice_ok);
    expect(voice.map((m) => m.id).sort()).toEqual([...VOICE_TRIO].sort());
  });

  test.each(VOICE_TRIO)('%s resolves to openrouter chat-completions capable model', (id) => {
    const r = mrm.resolveModel(id);
    expect(r.provider).toBe('openrouter');
    expect(r.conversational).toBe(true);
    expect(r.model).toBeTruthy();
    expect(r.configured).toBe(true);
  });

  test('pricing tags + honest slugs: GPT-5.4 Mini + Llama paid, Gemma 4 free', () => {
    const byId = Object.fromEntries(mrm.getModelCatalog().map((m) => [m.id, m]));
    expect(byId.openai_chat.model).toMatch(/gpt-5\.4-mini/);
    expect(byId.openai_chat.pricing).toBe('paid');
    expect(byId.openrouter_chat.model).toMatch(/llama-3\.3-70b/);
    expect(byId.openrouter_chat.pricing).toBe('paid');
    expect(byId.gemma4_local.model).toBe('google/gemma-4-31b-it:free');
    expect(byId.gemma4_local.pricing).toBe('free');
  });
});

describe('honest picker — no silent model swap', () => {
  test('Gemma pick only calls Gemma slug', () => {
    const c = _modelCandidates('google/gemma-4-31b-it:free');
    expect(c).toEqual(['google/gemma-4-31b-it:free']);
  });

  test('GPT pick only calls GPT-5.4 Mini slug', () => {
    const c = _modelCandidates('openai/gpt-5.4-mini');
    expect(c).toEqual(['openai/gpt-5.4-mini']);
  });

  test('Llama pick only calls Llama slug', () => {
    const c = _modelCandidates('meta-llama/llama-3.3-70b-instruct');
    expect(c).toEqual(['meta-llama/llama-3.3-70b-instruct']);
  });
});

describe('language + cross-domain for every voice model path', () => {
  test.each(['ar', 'en'])('system prompt for locale %s has language lock + XD curiosity', (lang) => {
    for (const id of VOICE_TRIO) {
      const slug = mrm.resolveModel(id).model;
      const sys = _buildSystemPrompt(
        { memory: { summary: 'likes walks', count: 1 }, health: {}, finance: {} },
        [{ domain: 'health', type: 'sleep', value: 4, unit: 'hours' },
          { domain: 'finance', type: 'expense', amount: 80, currency: 'USD' }],
        lang,
        slug,
      );
      expect(sys).toMatch(/LANGUAGE LOCK/i);
      expect(sys).toMatch(/CROSS-DOMAIN HARNESS|CROSS-DOMAIN CURIOSITY/i);
      expect(sys).toMatch(/MEMORY TRANSFER/i);
      if (lang === 'ar') {
        expect(sys).toMatch(/Arabic|فصحى/);
        expect(sys).toMatch(/Do NOT reply in English/);
      } else {
        expect(sys).toMatch(/English/);
        expect(sys).toMatch(/Do NOT reply in Arabic/);
      }
    }
  });

  test('detectLang real-time switch AR↔EN', () => {
    expect(detectLang('نمت ٤ ساعات')).toBe('ar');
    expect(detectLang('I slept 4 hours')).toBe('en');
  });

  test('AR user turn gets Arabic-only prefix in messages', () => {
    const msgs = _buildMessages([], 'صرفت ٥٠', 'ar');
    expect(msgs[0].content).toMatch(/^أجب بالعربية فقط/);
  });
});

describe('per-turn model attribution (mid-chat switching allowed)', () => {
  test('assistantModelMeta + read round-trip for attribution payload', () => {
    const meta = assistantModelMeta('openrouter_chat');
    expect(meta).toEqual({ catalog_model: 'openrouter_chat' });
    expect(_readCatalogModel(meta)).toBe('openrouter_chat');
    expect(_readCatalogModel([{ domain: 'health' }])).toBeNull();
    expect(assistantModelMeta(null)).toBeNull();
  });
});
