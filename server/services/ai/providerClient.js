const axios = require('axios');
require('dotenv').config();

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const SUPPORTED_PROVIDERS = new Set(['gemini']);

const normalizeProvider = (value) => value?.trim().toLowerCase() || '';

const resolveAIProvider = () => {
  const configuredProvider = normalizeProvider(process.env.AI_PROVIDER);
  if (!configuredProvider) {
    return 'gemini';
  }

  if (!SUPPORTED_PROVIDERS.has(configuredProvider)) {
    throw new Error(`Unsupported AI provider: ${process.env.AI_PROVIDER}`);
  }

  return configuredProvider;
};

const getProviderSettings = () => ({
  provider: resolveAIProvider(),
  apiKey: process.env.GEMINI_API_KEY || '',
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  endpoint: `${GEMINI_API_BASE_URL}/models/${process.env.GEMINI_MODEL || 'gemini-2.5-flash'}:generateContent`,
});

const extractResponseText = (payload) => {
  const candidates = payload?.candidates || [];
  const text = candidates
    .flatMap((candidate) => candidate?.content?.parts || [])
    .map((part) => part?.text)
    .filter(Boolean)
    .join('\n')
    .trim();

  if (text) return text;

  const blockedReason = payload?.promptFeedback?.blockReason;
  if (blockedReason) {
    throw new Error(`Gemini blocked the response: ${blockedReason}`);
  }

  const finishReason = candidates[0]?.finishReason;
  throw new Error(`Empty response from Gemini${finishReason ? ` (${finishReason})` : ''}`);
};

const generateStructuredJson = async ({
  systemInstruction,
  userPrompt,
  responseSchema,
  temperature = 0.1,
  maxOutputTokens = 1000,
}) => {
  const settings = getProviderSettings();

  if (!settings.apiKey) {
    throw new Error('Gemini API key is not configured.');
  }

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: responseSchema,
      temperature,
      maxOutputTokens,
    },
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const response = await axios.post(settings.endpoint, payload, {
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': settings.apiKey,
    },
  });

  const rawText = extractResponseText(response.data);

  try {
    return {
      provider: settings.provider,
      model: settings.model,
      rawText,
      data: JSON.parse(rawText),
      response: response.data,
    };
  } catch (error) {
    throw new Error(`Gemini returned invalid JSON: ${rawText.slice(0, 200)}`);
  }
};

module.exports = {
  generateStructuredJson,
  _resolveAIProvider: resolveAIProvider,
  _getProviderSettings: getProviderSettings,
  _extractResponseText: extractResponseText,
};
