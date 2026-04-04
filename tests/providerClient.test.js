jest.mock('axios', () => ({
  post: jest.fn(),
}));

const axios = require('axios');
const {
  generateStructuredJson,
  _resolveAIProvider,
  _getProviderSettings,
  _extractResponseText,
} = require('../server/services/ai/providerClient');

describe('providerClient', () => {
  const originalEnv = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    HF_API_KEY: process.env.HF_API_KEY,
    CUSTOM_HF_ENDPOINT: process.env.CUSTOM_HF_ENDPOINT,
  };

  afterEach(() => {
    jest.clearAllMocks();
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  });

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

  test('generateStructuredJson calls Gemini and parses JSON', async () => {
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
    delete process.env.GEMINI_API_KEY;

    await expect(generateStructuredJson({
      systemInstruction: 'JSON only.',
      userPrompt: 'hello',
      responseSchema: { type: 'object', properties: {} },
    })).rejects.toThrow('Gemini API key is not configured.');
  });

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

  test('generateStructuredJson calls custom_hf Space and parses JSON', async () => {
    process.env.AI_PROVIDER = 'custom_hf';
    process.env.HF_API_KEY = 'hf-test-key';
    process.env.CUSTOM_HF_ENDPOINT = 'https://os-1202883-lifesync-api.hf.space';

    axios.post.mockResolvedValue({
      data: {
        data: ['{"intent":"log_finance","domain":"finance","entities":[],"confidence":0.95}'],
      },
    });

    const result = await generateStructuredJson({
      systemInstruction: 'You are LifeSync NLP.',
      userPrompt: 'I spent $20 on coffee',
      temperature: 0.1,
      maxOutputTokens: 512,
    });

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [calledUrl] = axios.post.mock.calls[0];
    expect(calledUrl).toBe('https://os-1202883-lifesync-api.hf.space/run/predict');
    expect(result.data.intent).toBe('log_finance');
    expect(result.provider).toBe('custom_hf');
    expect(result.model).toBe('os-1202883/lifesync-nlp');
  });

  test('generateStructuredJson throws when custom_hf endpoint is missing', async () => {
    process.env.AI_PROVIDER = 'custom_hf';
    process.env.HF_API_KEY = 'hf-test-key';
    delete process.env.CUSTOM_HF_ENDPOINT;

    await expect(
      generateStructuredJson({ systemInstruction: 'x', userPrompt: 'y' })
    ).rejects.toThrow('CUSTOM_HF_ENDPOINT is not configured.');
  });
});
