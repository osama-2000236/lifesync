const axios = require('axios');
require('dotenv').config();

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const HF_API_BASE_URL = 'https://api-inference.huggingface.co/v1';
const GROQ_API_BASE_URL = 'https://api.groq.com/openai/v1';
const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';
const ANTHROPIC_API_BASE_URL = 'https://api.anthropic.com/v1';
const OPENROUTER_API_BASE_URL = 'https://openrouter.ai/api/v1';
const SUPPORTED_PROVIDERS = new Set([
  'gemini',
  'openai',
  'anthropic',
  'openrouter',
  'huggingface',
  'groq',
  'custom_hf',
  'ollama',
  'lmstudio',
  'bert_local',
]);
const runtimeProviderOverrides = new Map();

const normalizeProvider = (value) => value?.trim().toLowerCase() || '';
const isEnabled = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
const parsePositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const resolveCustomHFModelName = () =>
  process.env.CUSTOM_HF_MODEL?.trim()
  || process.env.HF_MODEL?.trim()
  || 'google/gemma-4-E2B-it';
const isStrictCustomHFMode = () => isEnabled(process.env.CUSTOM_HF_STRICT);
const getCustomHFMaxRetries = () => {
  if (process.env.CUSTOM_HF_MAX_RETRIES !== undefined) {
    const parsed = parseInt(process.env.CUSTOM_HF_MAX_RETRIES, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  return isStrictCustomHFMode() ? 0 : 1;
};

const resolveAIProvider = () => {
  const configuredProvider = normalizeProvider(process.env.AI_PROVIDER);
  console.log('AI_PROVIDER:', configuredProvider);
  if (!configuredProvider) return 'gemini';
  if (!SUPPORTED_PROVIDERS.has(configuredProvider)) {
    throw new Error(`Unsupported AI provider: ${process.env.AI_PROVIDER}`);
  }
  return configuredProvider;
};

/** Feature-scoped provider resolution. */
const getProvider = (feature) => {
  const key = feature === 'chat' ? 'CHAT_AI_PROVIDER' : 'INSIGHTS_AI_PROVIDER';
  const provider = runtimeProviderOverrides.get(feature)
    || normalizeProvider(process.env[key])
    || normalizeProvider(process.env.AI_PROVIDER)
    || 'gemini';
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    throw new Error(`Unsupported AI provider for ${feature}: ${provider}`);
  }
  return provider;
};

const setRuntimeProvider = (feature, provider) => {
  const normalized = normalizeProvider(provider);
  if (!SUPPORTED_PROVIDERS.has(normalized)) throw new Error(`Unsupported AI provider: ${provider}`);
  runtimeProviderOverrides.set(feature, normalized);
  return normalized;
};

const clearRuntimeProvider = (feature) => runtimeProviderOverrides.delete(feature);

const baseProviderSettings = (providerOverride) => {
  const provider = providerOverride || resolveAIProvider();

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

  if (provider === 'openai') {
    const baseUrl = (process.env.OPENAI_API_BASE_URL || OPENAI_API_BASE_URL).replace(/\/$/, '');
    return {
      provider,
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
      endpoint: `${baseUrl}/chat/completions`,
    };
  }

  if (provider === 'anthropic') {
    const baseUrl = (process.env.ANTHROPIC_API_BASE_URL || ANTHROPIC_API_BASE_URL).replace(/\/$/, '');
    return {
      provider,
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      endpoint: `${baseUrl}/messages`,
    };
  }

  if (provider === 'openrouter') {
    const baseUrl = (process.env.OPENROUTER_API_BASE_URL || OPENROUTER_API_BASE_URL).replace(/\/$/, '');
    return {
      provider,
      apiKey: process.env.OPENROUTER_API_KEY || '',
      model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct',
      endpoint: `${baseUrl}/chat/completions`,
      // OpenRouter ranks apps via these optional headers; harmless if unset.
      extraHeaders: {
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://lifesync.app',
        'X-Title': process.env.OPENROUTER_APP_NAME || 'LifeSync',
      },
    };
  }

  if (provider === 'custom_hf') {
    return {
      provider,
      apiKey: process.env.HF_API_KEY || '',
      endpoint: process.env.CUSTOM_HF_ENDPOINT || '',
    };
  }

  if (provider === 'ollama') {
    return {
      provider,
      apiKey: 'ollama', // dummy key
      model: process.env.OLLAMA_MODEL || 'gemma',
      endpoint: process.env.OLLAMA_API_BASE_URL || 'http://127.0.0.1:11434/v1/chat/completions',
    };
  }

  if (provider === 'lmstudio') {
    const baseUrl = (process.env.LM_STUDIO_API_BASE_URL || 'http://127.0.0.1:1234/v1').replace(/\/$/, '');
    const serverUrl = baseUrl.replace(/\/v1$/, '');
    return {
      provider,
      apiKey: process.env.LM_STUDIO_API_KEY || 'lm-studio',
      model: process.env.LM_STUDIO_MODEL || 'lifesync-local',
      endpoint: `${baseUrl}/chat/completions`,
      modelsEndpoint: `${baseUrl}/models`,
      statusEndpoint: `${serverUrl}/api/v0/models`,
    };
  }

  if (provider === 'bert_local') {
    const baseUrl = (process.env.BERT_RUNTIME_BASE_URL || 'http://127.0.0.1:1235').replace(/\/$/, '');
    return {
      provider,
      apiKey: 'local-bert',
      model: process.env.BERT_MODEL_NAME || 'bert_best_model_10pct',
      endpoint: `${baseUrl}/v1/classify`,
      statusEndpoint: `${baseUrl}/v1/status`,
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

// Runtime model overrides let the in-app model picker run a specific model
// (e.g. Gemma 3 vs Gemma 4) on a provider without rewriting env config.
const runtimeModelOverrides = new Map();
const setRuntimeModel = (provider, model) => {
  const normalized = normalizeProvider(provider);
  if (model) runtimeModelOverrides.set(normalized, model);
  else runtimeModelOverrides.delete(normalized);
  return model || null;
};
const clearRuntimeModel = (provider) => runtimeModelOverrides.delete(normalizeProvider(provider));

const getProviderSettings = (providerOverride) => {
  const settings = baseProviderSettings(providerOverride);
  const override = runtimeModelOverrides.get(normalizeProvider(settings.provider));
  if (override && 'model' in settings) settings.model = override;
  return settings;
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
    let text = payload?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      // For models that output reasoning in a separate field (e.g., Gemma via Ollama)
      text = payload?.choices?.[0]?.message?.reasoning_content?.trim();
    }
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
const callGemini = async ({ systemInstruction, userPrompt, responseSchema, temperature, maxOutputTokens, providerOverride }) => {
  const settings = getProviderSettings(providerOverride);

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
const callOpenAICompatible = async ({
  systemInstruction,
  userPrompt,
  responseSchema,
  temperature,
  maxOutputTokens,
  feature,
  providerOverride,
}) => {
  const settings = getProviderSettings(providerOverride);
  const providerLabel = settings.provider === 'groq'
    ? 'Groq'
    : settings.provider === 'openai'
      ? 'OpenAI'
    : settings.provider === 'openrouter'
      ? 'OpenRouter'
    : settings.provider === 'ollama'
      ? 'Ollama'
      : settings.provider === 'lmstudio'
        ? 'LM Studio'
        : 'HuggingFace';

  if (!['ollama', 'lmstudio'].includes(settings.provider) && !settings.apiKey) {
    throw new Error(`${providerLabel} API key is not configured.`);
  }

  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: userPrompt });

  const payload = {
    model: settings.model,
    messages,
    temperature: temperature ?? 0.1,
    max_tokens: maxOutputTokens ?? 1000,
    stream: false,
  };

  // OpenAI and LM Studio implement OpenAI-compatible structured output.
  // Constraining the response sharply reduces malformed JSON without coupling
  // app code to a particular hosted or local chat template.
  if ((settings.provider === 'openai' || settings.provider === 'lmstudio') && responseSchema) {
    payload.response_format = {
      type: 'json_schema',
      json_schema: {
        name: feature === 'insights' ? 'lifesync_insights' : 'lifesync_nlp',
        strict: true,
        schema: responseSchema,
      },
    };
  }

  // Ollama: force JSON to suppress reasoning text and return valid JSON.
  if (settings.provider === 'ollama') {
    payload.format = 'json';
  }

  // Insights need more time than chat; LM Studio gets its own larger budget.
  const timeoutMs = feature === 'insights' ? 300000 : 60000;

  const response = await axios.post(
    settings.endpoint,
    payload,
    {
      timeout: settings.provider === 'lmstudio'
        ? (parseInt(process.env.LM_STUDIO_REQUEST_TIMEOUT_MS, 10) || 180000)
        : timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
        ...(settings.extraHeaders || {}),
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
    if (feature === 'chat' && cleaned.includes('[') && cleaned.includes(']')) {
      const parsed = parseModelTagOutput(cleaned);
      return {
        provider: settings.provider,
        model: settings.model,
        rawText: cleaned,
        data: parsed,
        response: response.data,
      };
    }
    throw new Error(`${providerLabel} returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }
};

// ─── Call Anthropic Messages API ───
const extractAnthropicText = (payload) => {
  const text = (payload?.content || [])
    .filter((part) => part?.type === 'text' && part.text)
    .map((part) => part.text)
    .join('\n')
    .trim();
  if (!text) throw new Error('Empty response from Anthropic');
  return text;
};

const callAnthropic = async ({
  systemInstruction,
  userPrompt,
  responseSchema,
  temperature,
  maxOutputTokens,
}) => {
  const settings = getProviderSettings('anthropic');
  if (!settings.apiKey) throw new Error('Anthropic API key is not configured.');

  const schemaInstruction = responseSchema
    ? `\n\nReturn one JSON object that conforms to this JSON Schema:\n${JSON.stringify(responseSchema)}`
    : '';
  const payload = {
    model: settings.model,
    max_tokens: maxOutputTokens ?? 1000,
    temperature: temperature ?? 0.1,
    system: `${systemInstruction || ''}${schemaInstruction}`.trim(),
    messages: [{ role: 'user', content: userPrompt }],
  };

  const response = await axios.post(settings.endpoint, payload, {
    timeout: 60000,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': process.env.ANTHROPIC_VERSION || '2023-06-01',
    },
  });

  const rawText = extractAnthropicText(response.data);
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
    throw new Error(`Anthropic returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }
};

// ─── Conversational generation (multi-turn, free prose, no schema) ───
// Powers the "chat like any provider" experience: full conversation history is
// sent as a real messages array, the model replies in natural prose, and
// switching the model mid-conversation just changes which model produces the
// next turn. Logging/actions are handled separately (deterministic extractor),
// so this path is purely the conversation.
const sanitizeTurns = (messages = []) => {
  const turns = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && m.content && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
  // Most providers require the first turn to be the user.
  while (turns.length && turns[0].role === 'assistant') turns.shift();
  return turns;
};

const generateChat = async ({ system, messages, temperature = 0.4, maxTokens = 600, providerOverride, model } = {}) => {
  const provider = providerOverride ? normalizeProvider(providerOverride) : getProvider('chat');
  if (provider === 'bert_local') throw new Error('bert_local is a classifier, not a conversational generator.');
  if (!SUPPORTED_PROVIDERS.has(provider)) throw new Error(`Unsupported chat provider: ${provider}`);

  const settings = getProviderSettings(provider);
  if (model) settings.model = model;
  const turns = sanitizeTurns(messages);
  if (!turns.length) turns.push({ role: 'user', content: 'Hello' });

  if (provider === 'anthropic') {
    if (!settings.apiKey) throw new Error('Anthropic API key is not configured.');
    const response = await axios.post(settings.endpoint, {
      model: settings.model,
      max_tokens: maxTokens,
      temperature,
      ...(system ? { system } : {}),
      messages: turns,
    }, {
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': process.env.ANTHROPIC_VERSION || '2023-06-01',
      },
    });
    return { provider, model: settings.model, text: extractAnthropicText(response.data) };
  }

  if (provider === 'gemini') {
    if (!settings.apiKey) throw new Error('Gemini API key is not configured.');
    const payload = {
      contents: turns.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] })),
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    };
    if (system) payload.systemInstruction = { parts: [{ text: system }] };
    const response = await axios.post(settings.endpoint, payload, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey },
    });
    return { provider, model: settings.model, text: extractGeminiText(response.data) };
  }

  if (['openai', 'openrouter', 'lmstudio', 'ollama', 'groq', 'huggingface'].includes(provider)) {
    if (!['ollama', 'lmstudio'].includes(provider) && !settings.apiKey) {
      throw new Error(`${provider} API key is not configured.`);
    }
    const msgs = system ? [{ role: 'system', content: system }, ...turns] : turns;
    const response = await axios.post(settings.endpoint, {
      model: settings.model,
      messages: msgs,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }, {
      timeout: provider === 'lmstudio'
        ? (parseInt(process.env.LM_STUDIO_REQUEST_TIMEOUT_MS, 10) || 180000)
        : 60000,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}`, ...(settings.extraHeaders || {}) },
    });
    return { provider, model: settings.model, text: extractOpenAIText(response.data, provider) };
  }

  if (provider === 'custom_hf') {
    const flat = turns.map((t) => `${t.role === 'assistant' ? 'Assistant' : 'User'}: ${t.content}`).join('\n');
    const parsed = await callCustomHF(system || '', flat, { feature: 'chat' });
    const text = typeof parsed === 'string' ? parsed : (parsed?.response || JSON.stringify(parsed));
    return { provider, model: resolveCustomHFModelName(), text };
  }

  throw new Error(`Unsupported chat provider: ${provider}`);
};

// ─── Streaming conversational generation ───
// Token-by-token variant of generateChat, for real-time voice/chat UX (speak the
// first sentence while the rest is still generating instead of waiting for the
// full completion). Only OpenAI-compatible chat/completions providers expose an
// SSE token stream here (covers openrouter + custom_local/ollama/lmstudio, which
// is everything the model picker actually serves); other providers fall back to
// one non-streamed delta so callers can use a single code path either way.
const generateChatStream = async ({
  system, messages, temperature = 0.4, maxTokens = 600, providerOverride, model, onDelta, signal,
} = {}) => {
  const provider = providerOverride ? normalizeProvider(providerOverride) : getProvider('chat');
  if (provider === 'bert_local') throw new Error('bert_local is a classifier, not a conversational generator.');
  if (!SUPPORTED_PROVIDERS.has(provider)) throw new Error(`Unsupported chat provider: ${provider}`);

  if (!['openai', 'openrouter', 'lmstudio', 'ollama', 'groq', 'huggingface'].includes(provider)) {
    const full = await generateChat({ system, messages, temperature, maxTokens, providerOverride, model });
    onDelta?.(full.text);
    return full;
  }

  const settings = getProviderSettings(provider);
  if (model) settings.model = model;
  if (!['ollama', 'lmstudio'].includes(provider) && !settings.apiKey) {
    throw new Error(`${provider} API key is not configured.`);
  }

  const turns = sanitizeTurns(messages);
  if (!turns.length) turns.push({ role: 'user', content: 'Hello' });
  const msgs = system ? [{ role: 'system', content: system }, ...turns] : turns;

  const response = await axios.post(settings.endpoint, {
    model: settings.model,
    messages: msgs,
    temperature,
    max_tokens: maxTokens,
    stream: true,
  }, {
    timeout: provider === 'lmstudio'
      ? (parseInt(process.env.LM_STUDIO_REQUEST_TIMEOUT_MS, 10) || 180000)
      : 60000,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}`, ...(settings.extraHeaders || {}) },
    responseType: 'stream',
    signal,
  });

  let full = '';
  let buf = '';
  await new Promise((resolve, reject) => {
    response.data.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          const delta = json?.choices?.[0]?.delta?.content || '';
          if (delta) { full += delta; onDelta?.(delta); }
        } catch { /* ignore partial/malformed SSE chunk */ }
      }
    });
    response.data.on('end', resolve);
    response.data.on('error', reject);
    // Safety net: if the request is aborted mid-stream (e.g. voice barge-in),
    // some Node/axios versions close the socket without an 'end' or 'error'
    // event — without this the promise would hang forever.
    response.data.on('close', resolve);
  });

  if (!full.trim()) {
    if (signal?.aborted) throw new Error(`Streamed request to ${provider} was aborted`);
    throw new Error(`Empty streamed response from ${provider}`);
  }
  return { provider, model: settings.model, text: full };
};

/** Classify one message with the local BERT sequence-classification runtime. */
const classifyText = async (text) => {
  const settings = getProviderSettings('bert_local');
  const response = await axios.post(
    settings.endpoint,
    { text },
    {
      timeout: parseInt(process.env.BERT_RUNTIME_TIMEOUT_MS, 10) || 5000,
      headers: { 'Content-Type': 'application/json' },
    }
  );
  return response.data;
};

// ─── Parse tagged model output into NLP response shape ───
// Model outputs: [Category] Food [Amount] $50 [Activity] purchased ...
const parseModelTagOutput = (rawText) => {
  const tags = {};
  const regex = /\[(\w+(?:[- ]\w+)?)\]\s*([^\[\n]*)/g;
  let m;
  while ((m = regex.exec(rawText)) !== null) {
    const key = m[1].trim().toLowerCase().replace(/[- ]/g, '_');
    const val = m[2].trim();
    if (val && val !== 'N/A' && val !== 'None' && !tags[key]) {
      tags[key] = val; // first occurrence wins
    }
  }

  const amountStr = tags.amount ? tags.amount.replace(/[^0-9.]/g, '') : null;
  const amount = amountStr ? parseFloat(amountStr) : null;
  const category = tags.category || 'Other';
  const responseText = tags.response || tags.follow_up || 'Got it!';
  const confidenceRaw = tags.confidence ? parseFloat(tags.confidence) : null;
  const confidence = confidenceRaw ? confidenceRaw / 100 : 0.8;
  const intensity = tags.intensity ? parseInt(tags.intensity) : null;

  const entities = [];
  let domain = 'general';
  let intent = 'query_general';

  if (amount !== null && !isNaN(amount) && amount > 0) {
    domain = 'finance';
    intent = 'log_finance';
    entities.push({
      domain: 'finance',
      type: tags.feeling?.toLowerCase().includes('income') ? 'income' : 'expense',
      amount,
      currency: 'USD',
      category,
      activity: tags.description || tags.activity || 'transaction',
      description: tags.description || tags.activity || null,
    });
  }

  // Health: mood/exercise detected via tags
  if (intensity && tags.mood && tags.mood.toLowerCase() !== 'neutral') {
    const healthEntity = {
      domain: 'health',
      type: 'mood',
      value: intensity,
      unit: 'rating',
      category: 'Mood',
      activity: tags.mood,
    };
    if (domain === 'finance') {
      domain = 'both';
      intent = 'log_both';
    } else {
      domain = 'health';
      intent = 'log_health';
    }
    entities.push(healthEntity);
  }

  return {
    intent,
    domain,
    entities,
    response: responseText,
    is_cross_domain: domain === 'both',
    needs_clarification: false,
    clarification_question: '',
    clarification_options: [],
    confidence,
  };
};

/**
 * Calls the LifeSync HF Space via Gradio queue+SSE.
 * Includes cold-start retry logic: on 503/502/timeout, retries up to 3 times
 * with exponential backoff (5s, 10s, 20s).
 *
 * POST body : {"data": [system_msg, user_msg, temperature, max_tokens]}
 * SSE flow  : heartbeat* → complete → data:["<raw string>"]
 */
const getCustomHFRequestConfig = ({ temperature, maxOutputTokens, feature = 'chat' } = {}) => {
  const envTemperature = parseFloat(process.env.CUSTOM_HF_TEMPERATURE);
  const resolvedTemperature = Number.isFinite(temperature)
    ? temperature
    : (Number.isFinite(envTemperature) ? envTemperature : 0.1);
  const resolvedMaxTokens = Number.isFinite(maxOutputTokens)
    ? maxOutputTokens
    : parsePositiveInt(
      feature === 'insights'
        ? (process.env.CUSTOM_HF_INSIGHTS_MAX_TOKENS || process.env.CUSTOM_HF_MAX_TOKENS)
        : process.env.CUSTOM_HF_MAX_TOKENS,
      512
    );
  const sseTimeoutMs = parsePositiveInt(
    feature === 'insights'
      ? (process.env.CUSTOM_HF_INSIGHTS_TIMEOUT_MS || process.env.CUSTOM_HF_TIMEOUT_MS)
      : process.env.CUSTOM_HF_TIMEOUT_MS,
    feature === 'insights' ? 180_000 : 45_000
  );

  return {
    temperature: resolvedTemperature,
    maxTokens: resolvedMaxTokens,
    sseTimeoutMs,
  };
};

const callCustomHF = async (systemMsg, userMsg, options = {}) => {
  const BASE = (process.env.CUSTOM_HF_ENDPOINT ||
    'https://os-1202883-lifesync-api.hf.space').replace(/\/$/, '');
  const QUEUE = `${BASE}/gradio_api/call/infer`;
  const requestConfig = getCustomHFRequestConfig(options);

  const headers = { 'Content-Type': 'application/json' };
  const hfKey = process.env.HF_API_KEY;
  if (hfKey && hfKey.trim()) headers['Authorization'] = `Bearer ${hfKey.trim()}`;

  const MAX_RETRIES = getCustomHFMaxRetries();
  const BACKOFF_BASE_MS = 3000;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Step 1 — queue
      const qRes = await fetch(QUEUE, {
        method: 'POST',
        headers,
        body: JSON.stringify({ data: [systemMsg, userMsg, requestConfig.temperature, requestConfig.maxTokens] }),
        signal: AbortSignal.timeout(15_000),
      });

      // Cold-start detection: 502/503 means the Space is waking up
      if ((qRes.status === 502 || qRes.status === 503) && attempt < MAX_RETRIES) {
        const wait = BACKOFF_BASE_MS * Math.pow(2, attempt);
        console.warn(`HF Space cold start (${qRes.status}), retry ${attempt + 1}/${MAX_RETRIES} in ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      if (!qRes.ok) {
        const t = await qRes.text().catch(() => '');
        throw new Error(`HF queue failed ${qRes.status}: ${t.slice(0, 200)}`);
      }
      const { event_id: eventId } = await qRes.json();
      if (!eventId) throw new Error('HF Space returned no event_id');

      // Step 2 — SSE stream (45s timeout — fast enough for fallback to kick in)
      const sseRes = await fetch(`${BASE}/gradio_api/call/infer/${eventId}`, {
        headers: { Accept: 'text/event-stream', ...headers },
        signal: AbortSignal.timeout(requestConfig.sseTimeoutMs),
      });
      if (!sseRes.ok) throw new Error(`HF SSE failed ${sseRes.status}`);

      const reader = sseRes.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let lastEvent = '';
      let rawText = null;

      // eslint-disable-next-line no-constant-condition
      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (line.startsWith('event:')) lastEvent = line.slice(6).trim();
          else if (line.startsWith('data:')) {
            const ds = line.slice(5).trim();
            if (lastEvent === 'complete' && ds && ds !== 'null') {
              rawText = JSON.parse(ds)[0].trim();
              break outer;
            }
          }
        }
      }
      reader.cancel().catch(() => {});
      if (rawText === null) throw new Error('HF Space inference timeout — model did not return a result');

      // Step 3 — parse: try JSON first, then tag format, then fallback
      try {
        const cleaned = stripJsonFences(rawText);
        return JSON.parse(cleaned);
      } catch {
        if (rawText.includes('[') && rawText.includes(']')) {
          return parseModelTagOutput(rawText);
        }
        return {
          intent: 'query_general',
          domain: 'general',
          entities: [],
          response: rawText.slice(0, 500),
          is_cross_domain: false,
          needs_clarification: false,
          clarification_question: '',
          clarification_options: [],
          confidence: 0.3,
        };
      }
    } catch (err) {
      // On timeout or network error during queue step, retry if attempts remain
      const isRetryable = err.name === 'TimeoutError' || err.name === 'AbortError'
        || (err.message && (err.message.includes('502') || err.message.includes('503')
        || err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed')));

      if (isRetryable && attempt < MAX_RETRIES) {
        const wait = BACKOFF_BASE_MS * Math.pow(2, attempt);
        console.warn(`HF Space error (${err.message}), retry ${attempt + 1}/${MAX_RETRIES} in ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }

  throw new Error('HF Space: all retry attempts exhausted');
};

/**
 * Normalize model's loose `entities` into the shape the frontend
 * renderer requires (confirmed from production bundle 2026-04-06):
 *   health  → [{ type: string, value: string }]
 *   finance → [{ type: string, amount: number }]
 *   linked  → []
 */
const normalizeEntities = (parsed) => {
  const raw = Array.isArray(parsed.entities) ? parsed.entities : [];
  const domain = (parsed.domain || '').toLowerCase();

  if (domain === 'health') {
    return {
      health: raw.map((e) => typeof e === 'string'
        ? { type: 'activity', value: e }
        : { type: e.type || 'activity', value: e.value || String(e) }),
      finance: [],
      linked: [],
    };
  }
  if (domain === 'finance') {
    return {
      health: [],
      finance: raw.map((e) => (typeof e === 'object' && e)
        ? e
        : { type: 'expense', amount: 0, description: String(e) }),
      linked: [],
    };
  }
  // cross-domain / unknown
  return {
    health: raw.filter((e) => typeof e === 'string').map((e) => ({ type: 'activity', value: e })),
    finance: raw.filter((e) => typeof e === 'object' && e !== null),
    linked: [],
  };
};

// ─── Main exported function — provider-agnostic ───
// When CUSTOM_HF_STRICT=true, custom_hf is the only allowed model path.
const generateStructuredJson = async ({
  systemInstruction,
  userPrompt,
  responseSchema,
  temperature = 0.1,
  maxOutputTokens = 1000,
  feature = 'chat',
}) => {
  const provider = getProvider(feature);

  if (provider === 'bert_local') {
    throw new Error('bert_local is a sequence classifier, not a structured-text generator.');
  }

  if (provider === 'custom_hf') {
    try {
      const parsed = await callCustomHF(systemInstruction || '', userPrompt, {
        temperature,
        maxOutputTokens,
        feature,
      });
      return {
        provider: 'custom_hf',
        model: resolveCustomHFModelName(),
        rawText: JSON.stringify(parsed),
        data: parsed,
        response: parsed,
      };
    } catch (hfError) {
      if (isStrictCustomHFMode()) {
        throw hfError;
      }

      // Auto-fallback to Gemini if HF Space fails and Gemini key exists
      const geminiKey = process.env.GEMINI_API_KEY;
      if (geminiKey && geminiKey.trim()) {
        console.warn(`HF Space failed (${hfError.message}), falling back to Gemini`);
        return callGemini({
          systemInstruction,
          userPrompt,
          responseSchema,
          temperature,
          maxOutputTokens,
          providerOverride: 'gemini',
        });
      }
      throw hfError; // No fallback available
    }
  }

  if (provider === 'anthropic') {
    return callAnthropic({
      systemInstruction,
      userPrompt,
      responseSchema,
      temperature,
      maxOutputTokens,
      feature,
    });
  }

  if (provider === 'huggingface' || provider === 'groq' || provider === 'openai' || provider === 'openrouter' || provider === 'ollama' || provider === 'lmstudio') {
    return callOpenAICompatible({
      systemInstruction,
      userPrompt,
      responseSchema,
      temperature,
      maxOutputTokens,
      feature,
      providerOverride: provider,
    });
  }

  return callGemini({ systemInstruction, userPrompt, responseSchema, temperature, maxOutputTokens, providerOverride: provider });
};

/**
 * Return a secret-free provider readiness snapshot for diagnostics and QA.
 */
const getAIProviderStatus = async (feature = 'chat', providerOverride = null) => {
  const provider = providerOverride ? normalizeProvider(providerOverride) : getProvider(feature);
  if (!SUPPORTED_PROVIDERS.has(provider)) throw new Error(`Unsupported AI provider: ${provider}`);
  const settings = getProviderSettings(provider);
  const base = {
    feature,
    provider,
    configured_model: settings.model || null,
    local: provider === 'lmstudio' || provider === 'ollama' || provider === 'bert_local',
  };

  if (provider === 'bert_local') {
    try {
      const response = await axios.get(settings.statusEndpoint, { timeout: 3000 });
      return {
        ...base,
        status: response.data?.status === 'ready' ? 'ready' : 'unavailable',
        architecture: response.data?.architecture || null,
        task: response.data?.task || null,
        execution_provider: response.data?.provider || null,
        labels: response.data?.labels || [],
        artifact_sha256: response.data?.artifact_sha256 || null,
        long_context: {
          strategy: response.data?.long_context_strategy || 'single_window',
          sequence_length: response.data?.sequence_length || null,
          chunk_stride: response.data?.chunk_stride || null,
          max_chunks: response.data?.max_chunks || 1,
          multi_label_threshold: response.data?.multi_label_threshold ?? null,
        },
        runtime_metrics: {
          requests: response.data?.requests || 0,
          mean_latency_ms: response.data?.mean_latency_ms ?? null,
          p95_latency_ms: response.data?.p95_latency_ms ?? null,
        },
      };
    } catch (error) {
      return {
        ...base,
        status: 'unreachable',
        error: error.code || error.message,
      };
    }
  }

  if (provider !== 'lmstudio' && provider !== 'ollama') {
    const configured = provider === 'custom_hf' ? Boolean(settings.endpoint) : Boolean(settings.apiKey);
    return { ...base, status: configured ? 'configured' : 'not_configured' };
  }

  const modelsEndpoint = settings.statusEndpoint || settings.modelsEndpoint
    || settings.endpoint.replace(/\/chat\/completions\/?$/, '/models');
  try {
    const response = await axios.get(modelsEndpoint, { timeout: 3000 });
    const models = response.data?.data || [];
    const loadedModels = models
      .filter((model) => !model.state || model.state === 'loaded')
      .map((model) => model.id)
      .filter(Boolean);
    return {
      ...base,
      status: loadedModels.includes(settings.model) ? 'ready' : 'model_not_loaded',
      loaded_models: loadedModels,
    };
  } catch (error) {
    return {
      ...base,
      status: 'unreachable',
      loaded_models: [],
      error: error.code || error.message,
    };
  }
};

module.exports = {
  generateStructuredJson,
  generateChat,
  generateChatStream,
  classifyText,
  getAIProviderStatus,
  normalizeEntities,
  _resolveAIProvider: resolveAIProvider,
  _getProvider: getProvider,
  _getProviderSettings: getProviderSettings,
  _setRuntimeProvider: setRuntimeProvider,
  _clearRuntimeProvider: clearRuntimeProvider,
  _setRuntimeModel: setRuntimeModel,
  _clearRuntimeModel: clearRuntimeModel,
  _extractResponseText: extractGeminiText,
  _extractAnthropicText: extractAnthropicText,
  _parseModelTagOutput: parseModelTagOutput,
  _resolveCustomHFModelName: resolveCustomHFModelName,
  _isStrictCustomHFMode: isStrictCustomHFMode,
};
