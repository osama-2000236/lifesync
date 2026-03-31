const {
  _resolveAIProvider,
  _getProviderSettings,
} = require('../server/services/ai/providerClient');

describe('providerClient', () => {
  const originalEnv = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
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
    process.env.OPENAI_API_KEY = 'sk-test';

    expect(_resolveAIProvider()).toBe('deepseek');

    const settings = _getProviderSettings();
    expect(settings.provider).toBe('deepseek');
    expect(settings.model).toBe('deepseek-chat');
    expect(settings.clientOptions.baseURL).toBe('https://api.deepseek.com');
  });

  test('falls back to openai when only openai is configured', () => {
    delete process.env.AI_PROVIDER;
    delete process.env.DEEPSEEK_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.OPENAI_MODEL = 'gpt-4o-mini';

    expect(_resolveAIProvider()).toBe('openai');

    const settings = _getProviderSettings();
    expect(settings.provider).toBe('openai');
    expect(settings.model).toBe('gpt-4o-mini');
    expect(settings.clientOptions.baseURL).toBeUndefined();
  });

  test('defaults to deepseek when no provider is configured', () => {
    delete process.env.AI_PROVIDER;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENAI_API_KEY;

    expect(_resolveAIProvider()).toBe('deepseek');
  });

  test('throws for unsupported provider names', () => {
    process.env.AI_PROVIDER = 'anthropic';

    expect(() => _resolveAIProvider()).toThrow('Unsupported AI provider');
  });
});
