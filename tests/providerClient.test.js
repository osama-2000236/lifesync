jest.mock('axios', () => ({
  post: jest.fn(),
}));

const axios = require('axios');
const {
  generateStructuredJson,
  normalizeEntities,
  _resolveAIProvider,
  _getProvider,
  _getProviderSettings,
  _extractResponseText,
  _parseModelTagOutput,
} = require('../server/services/ai/providerClient');

// Helper: build a mock SSE ReadableStream from lines
function mockSSEStream(lines) {
  const encoder = new TextEncoder();
  let idx = 0;
  return new ReadableStream({
    pull(controller) {
      if (idx < lines.length) {
        controller.enqueue(encoder.encode(lines[idx] + '\n'));
        idx++;
      } else {
        controller.close();
      }
    },
  });
}

// Helper: mock fetch for Gradio queue+SSE flow
function mockFetchForCustomHF(modelOutput) {
  const eventId = 'test-event-123';
  const sseLines = [
    'event: heartbeat', 'data: null', '',
    'event: complete', `data: ${JSON.stringify([modelOutput])}`, '',
  ];

  global.fetch = jest.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ event_id: eventId }),
    })
    .mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => {
          const encoder = new TextEncoder();
          let idx = 0;
          return {
            read: async () => {
              if (idx < sseLines.length) {
                const line = sseLines[idx++];
                return { done: false, value: encoder.encode(line + '\n') };
              }
              return { done: true, value: undefined };
            },
            cancel: async () => {},
          };
        },
      },
    });
}

describe('providerClient', () => {
  const originalEnv = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    CHAT_AI_PROVIDER: process.env.CHAT_AI_PROVIDER,
    INSIGHTS_AI_PROVIDER: process.env.INSIGHTS_AI_PROVIDER,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    HF_API_KEY: process.env.HF_API_KEY,
    CUSTOM_HF_ENDPOINT: process.env.CUSTOM_HF_ENDPOINT,
    CUSTOM_HF_TEMPERATURE: process.env.CUSTOM_HF_TEMPERATURE,
    CUSTOM_HF_MAX_TOKENS: process.env.CUSTOM_HF_MAX_TOKENS,
  };

  afterEach(() => {
    jest.clearAllMocks();
    if (global.fetch?.mockRestore) global.fetch.mockRestore();
    delete global.fetch;
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  });

  // ─── resolveAIProvider ───

  test('resolves gemini when explicitly configured', () => {
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'gem-test-key';
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';

    expect(_resolveAIProvider()).toBe('gemini');

    const settings = _getProviderSettings();
    expect(settings.provider).toBe('gemini');
    expect(settings.model).toBe('gemini-2.5-flash');
    expect(settings.endpoint).toContain('/models/gemini-2.5-flash:generateContent');
  });

  test('defaults to gemini when no provider is configured', () => {
    delete process.env.AI_PROVIDER;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;

    expect(_resolveAIProvider()).toBe('gemini');

    const settings = _getProviderSettings();
    expect(settings.provider).toBe('gemini');
    expect(settings.model).toBe('gemini-2.5-flash');
  });

  test('throws for unsupported provider names', () => {
    process.env.AI_PROVIDER = 'deepseek';

    expect(() => _resolveAIProvider()).toThrow('Unsupported AI provider');
  });

  // ─── getProvider (feature-scoped) ───

  test('getProvider returns CHAT_AI_PROVIDER for chat feature', () => {
    process.env.CHAT_AI_PROVIDER = 'custom_hf';
    process.env.AI_PROVIDER = 'gemini';

    expect(_getProvider('chat')).toBe('custom_hf');
  });

  test('getProvider returns INSIGHTS_AI_PROVIDER for insights feature', () => {
    process.env.INSIGHTS_AI_PROVIDER = 'gemini';
    process.env.AI_PROVIDER = 'custom_hf';

    expect(_getProvider('insights')).toBe('gemini');
  });

  test('getProvider falls back to AI_PROVIDER when feature var is absent', () => {
    delete process.env.CHAT_AI_PROVIDER;
    process.env.AI_PROVIDER = 'groq';

    expect(_getProvider('chat')).toBe('groq');
  });

  test('getProvider falls back to gemini when all vars are absent', () => {
    delete process.env.CHAT_AI_PROVIDER;
    delete process.env.INSIGHTS_AI_PROVIDER;
    delete process.env.AI_PROVIDER;

    expect(_getProvider('chat')).toBe('gemini');
    expect(_getProvider('insights')).toBe('gemini');
  });

  // ─── getProviderSettings with override ───

  test('getProviderSettings accepts providerOverride', () => {
    process.env.AI_PROVIDER = 'custom_hf';
    process.env.GEMINI_API_KEY = 'gem-key';

    // Override to gemini even though AI_PROVIDER=custom_hf
    const settings = _getProviderSettings('gemini');
    expect(settings.provider).toBe('gemini');
    expect(settings.apiKey).toBe('gem-key');
  });

  // ─── Gemini text extractor ───

  test('extracts text from Gemini candidates', () => {
    const text = _extractResponseText({
      candidates: [
        {
          content: {
            parts: [
              { text: '{"ok":true}' },
            ],
          },
        },
      ],
    });

    expect(text).toBe('{"ok":true}');
  });

  test('throws when Gemini returns no text', () => {
    expect(() => _extractResponseText({ candidates: [] })).toThrow('Empty response from Gemini');
  });

  // ─── generateStructuredJson — Gemini path ───

  test('generateStructuredJson calls Gemini and parses JSON', async () => {
    delete process.env.CHAT_AI_PROVIDER;
    delete process.env.AI_PROVIDER;
    process.env.GEMINI_API_KEY = 'gem-test-key';
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';

    axios.post.mockResolvedValue({
      data: {
        candidates: [
          {
            content: {
              parts: [
                { text: '{"intent":"query_general","entities":[]}' },
              ],
            },
          },
        ],
      },
    });

    const result = await generateStructuredJson({
      systemInstruction: 'JSON only.',
      userPrompt: 'hello',
      responseSchema: {
        type: 'object',
        properties: {
          intent: { type: 'string' },
          entities: { type: 'array', items: { type: 'string' } },
        },
      },
      temperature: 0,
      maxOutputTokens: 100,
    });

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(result.data.intent).toBe('query_general');
    expect(result.rawText).toBe('{"intent":"query_general","entities":[]}');
  });

  test('generateStructuredJson throws when the key is missing', async () => {
    delete process.env.CHAT_AI_PROVIDER;
    delete process.env.AI_PROVIDER;
    delete process.env.GEMINI_API_KEY;

    await expect(generateStructuredJson({
      systemInstruction: 'JSON only.',
      userPrompt: 'hello',
      responseSchema: { type: 'object', properties: {} },
    })).rejects.toThrow('Gemini API key is not configured.');
  });

  // ─── resolveAIProvider — custom_hf settings ───

  test('resolves custom_hf provider settings', () => {
    process.env.AI_PROVIDER = 'custom_hf';
    process.env.HF_API_KEY = 'hf-test-key';
    process.env.CUSTOM_HF_ENDPOINT = 'https://os-1202883-lifesync-api.hf.space';

    expect(_resolveAIProvider()).toBe('custom_hf');
    const settings = _getProviderSettings();
    expect(settings.provider).toBe('custom_hf');
    expect(settings.apiKey).toBe('hf-test-key');
    expect(settings.endpoint).toBe('https://os-1202883-lifesync-api.hf.space');
  });

  // ─── generateStructuredJson — custom_hf path via Gradio SSE ───

  test('generateStructuredJson calls custom_hf via Gradio queue+SSE', async () => {
    process.env.CHAT_AI_PROVIDER = 'custom_hf';
    process.env.CUSTOM_HF_ENDPOINT = 'https://os-1202883-lifesync-api.hf.space';
    delete process.env.HF_API_KEY;

    const modelJson = '{"intent":"log_finance","domain":"finance","entities":[{"domain":"finance","type":"expense","amount":20}],"response":"Logged!","confidence":0.95,"is_cross_domain":false,"needs_clarification":false,"clarification_question":"","clarification_options":[]}';
    mockFetchForCustomHF(modelJson);

    const result = await generateStructuredJson({
      systemInstruction: 'You are LifeSync NLP.',
      userPrompt: 'I spent $20 on coffee',
      temperature: 0.1,
      maxOutputTokens: 512,
    });

    // Verify queue call URL
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const [queueUrl] = global.fetch.mock.calls[0];
    expect(queueUrl).toBe('https://os-1202883-lifesync-api.hf.space/gradio_api/call/infer');

    // Verify SSE call URL
    const [sseUrl] = global.fetch.mock.calls[1];
    expect(sseUrl).toBe('https://os-1202883-lifesync-api.hf.space/gradio_api/call/infer/test-event-123');

    expect(result.data.intent).toBe('log_finance');
    expect(result.provider).toBe('custom_hf');
    expect(result.model).toBe('os-1202883/LifeSync');
  });

  test('generateStructuredJson handles tagged model output from custom_hf', async () => {
    process.env.CHAT_AI_PROVIDER = 'custom_hf';
    process.env.CUSTOM_HF_ENDPOINT = 'https://os-1202883-lifesync-api.hf.space';

    const taggedOutput = '[Category] Food [Amount] $50 [Activity] purchased [Description] food [Response] Got it! Logged $50 for food. [Confidence] 90%';
    mockFetchForCustomHF(taggedOutput);

    const result = await generateStructuredJson({
      systemInstruction: 'You are LifeSync.',
      userPrompt: 'I spent 50 on food',
    });

    expect(result.data.intent).toBe('log_finance');
    expect(result.data.domain).toBe('finance');
    expect(result.data.entities).toHaveLength(1);
    expect(result.data.entities[0].amount).toBe(50);
    expect(result.data.entities[0].category).toBe('Food');
    expect(result.data.confidence).toBeCloseTo(0.9);
  });

  // ─── parseModelTagOutput ───

  test('parseModelTagOutput extracts finance entity from tags', () => {
    const result = _parseModelTagOutput(
      '[Category] Transportation [Amount] $25.50 [Activity] taxi ride [Response] Logged your taxi expense.'
    );

    expect(result.intent).toBe('log_finance');
    expect(result.domain).toBe('finance');
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].amount).toBe(25.50);
    expect(result.entities[0].category).toBe('Transportation');
    expect(result.response).toBe('Logged your taxi expense.');
  });

  test('parseModelTagOutput returns general for no recognized tags', () => {
    const result = _parseModelTagOutput('Hello! How can I help you today?');

    expect(result.intent).toBe('query_general');
    expect(result.domain).toBe('general');
    expect(result.entities).toHaveLength(0);
  });

  // ─── normalizeEntities ───

  test('normalizeEntities shapes finance entities correctly', () => {
    const result = normalizeEntities({
      domain: 'finance',
      entities: [{ type: 'expense', amount: 50, category: 'Food' }],
    });

    expect(result.health).toEqual([]);
    expect(result.finance).toHaveLength(1);
    expect(result.finance[0].amount).toBe(50);
    expect(result.linked).toEqual([]);
  });

  test('normalizeEntities shapes health string entities', () => {
    const result = normalizeEntities({
      domain: 'health',
      entities: ['running', '5km'],
    });

    expect(result.health).toHaveLength(2);
    expect(result.health[0]).toEqual({ type: 'activity', value: 'running' });
    expect(result.finance).toEqual([]);
  });

  // ─── feature-scoped routing in generateStructuredJson ───

  test('insights feature routes to Gemini even when AI_PROVIDER=custom_hf', async () => {
    process.env.AI_PROVIDER = 'custom_hf';
    process.env.INSIGHTS_AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'gem-key';
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';

    axios.post.mockResolvedValue({
      data: {
        candidates: [{
          content: { parts: [{ text: '{"summary":"test"}' }] },
        }],
      },
    });

    const result = await generateStructuredJson({
      systemInstruction: 'Insights.',
      userPrompt: 'analyze',
      responseSchema: { type: 'object', properties: { summary: { type: 'string' } } },
      feature: 'insights',
    });

    // Should have called axios (Gemini), NOT fetch (custom_hf)
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(result.data.summary).toBe('test');
  });
});
