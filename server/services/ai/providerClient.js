const axios = require('axios');
require('dotenv').config();

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const HF_API_BASE_URL = 'https://api-inference.huggingface.co/v1';
const GROQ_API_BASE_URL = 'https://api.groq.com/openai/v1';
const SUPPORTED_PROVIDERS = new Set(['gemini', 'huggingface', 'groq', 'custom_hf']);

const normalizeProvider = (value) => value?.trim().toLowerCase() || '';

const resolveAIProvider = () => {
  const configuredProvider = normalizeProvider(process.env.AI_PROVIDER);
  if (!configuredProvider) return 'gemini';
  if (!SUPPORTED_PROVIDERS.has(configuredProvider)) {
    throw new Error(`Unsupported AI provider: ${process.env.AI_PROVIDER}`);
  }
  return configuredProvider;
};

const getProviderSettings = () => {
  const provider = resolveAIProvider();

  if (provider === 'huggingface') {
    return {
      provider,
      apiKey: process.env.HF_API_KEY || '',
      model: process.env.HF_MODEL || 'mistralai/Mistral-7B-Instruct-v0.3',
      endpoint: `${HF_API_BASE_URL}/chat/completions`,
    };
  }

  if (provider === 'groq') {
    return {
      provider,
      apiKey: process.env.GROQ_API_KEY || '',
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      endpoint: `${GROQ_API_BASE_URL}/chat/completions`,
    };
  }

  if (provider === 'custom_hf') {
    return {
      provider,
      apiKey: process.env.HF_API_KEY || '',
      endpoint: process.env.CUSTOM_HF_ENDPOINT || '',
    };
  }

  // Default: Gemini
  return {
    provider,
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    endpoint: `${GEMINI_API_BASE_URL}/models/${process.env.GEMINI_MODEL || 'gemini-2.5-flash'}:generateContent`,
  };
};

// ─── Gemini response extractor ───
const extractGeminiText = (payload) => {
  const candidates = payload?.candidates || [];
  const text = candidates
    .flatMap((c) => c?.content?.parts || [])
    .map((p) => p?.text)
    .filter(Boolean)
    .join('\n')
    .trim();

  if (text) return text;

  const blockedReason = payload?.promptFeedback?.blockReason;
  if (blockedReason) throw new Error(`Gemini blocked the response: ${blockedReason}`);

  const finishReason = candidates[0]?.finishReason;
  throw new Error(`Empty response from Gemini${finishReason ? ` (${finishReason})` : ''}`);
};

// ─── OpenAI-compatible response extractor (HuggingFace + Groq) ───
const extractOpenAIText = (payload, providerName) => {
  const text = payload?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`Empty response from ${providerName}`);
  return text;
};

// ─── Extract JSON object from model output (handles preamble/postamble text) ───
const stripJsonFences = (text) => {
  // Find the first { and last } to extract the JSON object directly
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1).trim();
  }
  // Fallback: strip markdown fences only
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
};

// ─── Call Gemini ───
const callGemini = async ({ systemInstruction, userPrompt, responseSchema, temperature, maxOutputTokens }) => {
  const settings = getProviderSettings();

  if (!settings.apiKey) throw new Error('Gemini API key is not configured.');

  const payload = {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: responseSchema,
      temperature,
      maxOutputTokens,
    },
  };

  if (systemInstruction) {
    payload.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const response = await axios.post(settings.endpoint, payload, {
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': settings.apiKey,
    },
  });

  const rawText = extractGeminiText(response.data);

  try {
    return {
      provider: settings.provider,
      model: settings.model,
      rawText,
      data: JSON.parse(rawText),
      response: response.data,
    };
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${rawText.slice(0, 200)}`);
  }
};

// ─── Call OpenAI-compatible endpoint (HuggingFace or Groq) ───
const callOpenAICompatible = async ({ systemInstruction, userPrompt, temperature, maxOutputTokens }) => {
  const settings = getProviderSettings();
  const providerLabel = settings.provider === 'groq' ? 'Groq' : 'HuggingFace';

  if (!settings.apiKey) throw new Error(`${providerLabel} API key is not configured.`);

  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: userPrompt });

  const response = await axios.post(
    settings.endpoint,
    {
      model: settings.model,
      messages,
      temperature: temperature ?? 0.1,
      max_tokens: maxOutputTokens ?? 1000,
      stream: false,
    },
    {
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
    }
  );

  const rawText = extractOpenAIText(response.data, providerLabel);
  const cleaned = stripJsonFences(rawText);

  try {
    return {
      provider: settings.provider,
      model: settings.model,
      rawText: cleaned,
      data: JSON.parse(cleaned),
      response: response.data,
    };
  } catch {
    throw new Error(`${providerLabel} returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }
};

// ─── Call LifeSync fine-tuned model via Gradio Space ───
const callCustomHF = async ({ systemInstruction, userPrompt, temperature, maxOutputTokens }) => {
  const settings = getProviderSettings();

  if (!settings.apiKey) throw new Error('HF_API_KEY is not configured for custom_hf provider.');
  if (!settings.endpoint) throw new Error('CUSTOM_HF_ENDPOINT is not configured.');

  const response = await axios.post(
    `${settings.endpoint}/run/predict`,
    {
      data: [
        systemInstruction || '',
        userPrompt,
        temperature ?? 0.1,
        maxOutputTokens ?? 512,
      ],
    },
    {
      timeout: 120000, // 2 min — covers ZeroGPU cold start
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
    }
  );

  const rawText = response.data?.data?.[0];
  if (!rawText) throw new Error('Empty response from LifeSync HF Space');
  const cleaned = stripJsonFences(rawText);

  try {
    return {
      provider: settings.provider,
      model: 'os-1202883/LifeSync',
      rawText: cleaned,
      data: JSON.parse(cleaned),
      response: response.data,
    };
  } catch {
    throw new Error(`LifeSync HF Space returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }
};

// ─── Main exported function — provider-agnostic ───
const generateStructuredJson = async ({
  systemInstruction,
  userPrompt,
  responseSchema,
  temperature = 0.1,
  maxOutputTokens = 1000,
}) => {
  const provider = resolveAIProvider();

  if (provider === 'custom_hf') {
    return callCustomHF({ systemInstruction, userPrompt, temperature, maxOutputTokens });
  }

  if (provider === 'huggingface' || provider === 'groq') {
    return callOpenAICompatible({ systemInstruction, userPrompt, temperature, maxOutputTokens });
  }

  return callGemini({ systemInstruction, userPrompt, responseSchema, temperature, maxOutputTokens });
};

module.exports = {
  generateStructuredJson,
  _resolveAIProvider: resolveAIProvider,
  _getProviderSettings: getProviderSettings,
  _extractResponseText: extractGeminiText,
};
