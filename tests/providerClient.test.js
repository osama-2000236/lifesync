const {
  _resolveAIProvider,
  _getProviderSettings,
} = require('../server/services/ai/providerClient');

describe('providerClient', () => {
  const originalEnv = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
  };

  afterEach(() => {
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  });

  test('prefers explicit deepseek provider configuration', () => {
    process.env.AI_PROVIDER = 'deepseek';
    process.env.DEEPSEEK_API_KEY = 'ds-test';
    process.env.DEEPSEEK_MODEL = 'deepseek-chat';

    expect(_resolveAIProvider()).toBe('deepseek');

    const settings = _getProviderSettings();
    expect(settings.provider).toBe('deepseek');
    expect(settings.model).toBe('deepseek-chat');
    expect(settings.clientOptions.baseURL).toBe('https://api.deepseek.com');
  });

  test('defaults to deepseek when provider is omitted', () => {
    delete process.env.AI_PROVIDER;

    expect(_resolveAIProvider()).toBe('deepseek');
  });

  test('throws for unsupported provider names', () => {
    process.env.AI_PROVIDER = 'openai';

    expect(() => _resolveAIProvider()).toThrow('Unsupported AI provider');
  });
});
