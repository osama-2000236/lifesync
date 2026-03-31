const OpenAI = require('openai');
require('dotenv').config();

let cachedClient = null;

const normalizeProvider = (value) => value?.trim().toLowerCase() || '';

const resolveAIProvider = () => {
  const configuredProvider = normalizeProvider(process.env.AI_PROVIDER);

  if (!configuredProvider) {
    return 'deepseek';
  }

  if (configuredProvider !== 'deepseek') {
    throw new Error(`Unsupported AI provider: ${process.env.AI_PROVIDER}`);
  }

  return 'deepseek';
};

const getProviderSettings = () => {
  const apiKey = process.env.DEEPSEEK_API_KEY || '';

  return {
    provider: resolveAIProvider(),
    apiKey,
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    clientOptions: {
      apiKey,
      baseURL: 'https://api.deepseek.com',
    },
  };
};

const getAIClient = () => {
  const settings = getProviderSettings();

  if (!settings.apiKey) {
    throw new Error('DeepSeek API key is not configured.');
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
