const OpenAI = require('openai');
require('dotenv').config();

const SUPPORTED_PROVIDERS = new Set(['deepseek', 'openai']);
let cachedClient = null;

const normalizeProvider = (value) => value?.trim().toLowerCase() || '';

const resolveAIProvider = () => {
  const configuredProvider = normalizeProvider(process.env.AI_PROVIDER);
  if (configuredProvider) {
    if (!SUPPORTED_PROVIDERS.has(configuredProvider)) {
      throw new Error(`Unsupported AI provider: ${process.env.AI_PROVIDER}`);
    }
    return configuredProvider;
  }

  if (process.env.DEEPSEEK_API_KEY) return 'deepseek';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'deepseek';
};

const getProviderSettings = () => {
  const provider = resolveAIProvider();

  if (provider === 'deepseek') {
    const apiKey = process.env.DEEPSEEK_API_KEY || '';
    return {
      provider,
      apiKey,
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      clientOptions: {
        apiKey,
        baseURL: 'https://api.deepseek.com',
      },
    };
  }

  return {
    provider,
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    clientOptions: {
      apiKey: process.env.OPENAI_API_KEY || '',
    },
  };
};

const getAIClient = () => {
  const settings = getProviderSettings();

  if (!settings.apiKey) {
    const providerName = settings.provider === 'deepseek' ? 'DeepSeek' : 'OpenAI';
    throw new Error(`${providerName} API key is not configured.`);
  }

  const signature = JSON.stringify({
    provider: settings.provider,
    apiKey: settings.apiKey,
    model: settings.model,
  });

  if (!cachedClient || cachedClient.signature !== signature) {
    cachedClient = {
      signature,
      client: new OpenAI(settings.clientOptions),
    };
  }

  return cachedClient.client;
};

const getAIModel = () => getProviderSettings().model;

const resetAIClient = () => {
  cachedClient = null;
};

module.exports = {
  getAIClient,
  getAIModel,
  _resolveAIProvider: resolveAIProvider,
  _getProviderSettings: getProviderSettings,
  _resetAIClient: resetAIClient,
};
