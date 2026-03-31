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
});
