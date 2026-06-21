const axios = require('axios');
require('dotenv').config();

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const HF_API_BASE_URL = 'https://api-inference.huggingface.co/v1';
const GROQ_API_BASE_URL = 'https://api.groq.com/openai/v1';
const SUPPORTED_PROVIDERS = new Set(['bert', 'gemini', 'huggingface', 'groq', 'custom_hf', 'ollama']);

const resolveBertEndpoint = () =>
  (process.env.BERT_SERVICE_URL || 'http://127.0.0.1:8088').replace(/\/+$/, '');
const isStrictBertMode = () => isEnabled(process.env.BERT_STRICT);
const getBertTimeoutMs = (feature) => parsePositiveInt(
  feature === 'insights' ? process.env.BERT_INSIGHTS_TIMEOUT_MS : process.env.BERT_TIMEOUT_MS,
  feature === 'insights' ? 60_000 : 20_000,
);

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
  return normalizeProvider(process.env[key]) || normalizeProvider(process.env.AI_PROVIDER) || 'gemini';
};

const getProviderSettings = (providerOverride) => {
  const provider = providerOverride || resolveAIProvider();

  if (provider === 'bert') {
    return {
      provider,
      apiKey: '',
      model: process.env.BERT_MODEL_NAME || 'distilbert (LifeSync NLP)',
      endpoint: resolveBertEndpoint(),
    };
  }

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

  if (provider === 'ollama') {
    return {
      provider,
      apiKey: 'ollama', // dummy key
      model: process.env.OLLAMA_MODEL || 'gemma',
      endpoint: (process.env.OLLAMA_API_BASE_URL || 'http://ollama:11434/v1/chat/completions').replace(/\/+$/, '') + '/chat/completions',
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
const callOpenAICompatible = async ({ systemInstruction, userPrompt, temperature, maxOutputTokens, providerOverride, feature }) => {
  const settings = getProviderSettings(providerOverride);
  const providerLabel = settings.provider === 'groq' ? 'Groq' : (settings.provider === 'ollama' ? 'Ollama' : 'HuggingFace');

  if (settings.provider !== 'ollama' && !settings.apiKey) throw new Error(`${providerLabel} API key is not configured.`);

  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: userPrompt });

  // Build the payload
  const payload = {
    model: settings.model,
    messages,
    temperature: temperature ?? 0.1,
    max_tokens: maxOutputTokens ?? 1000,
    stream: false,
  };

  // For Ollama, specify the response format as JSON to suppress reasoning and get valid JSON
  if (settings.provider === 'ollama') {
    payload.format = 'json';
  }

  // Set timeout based on feature: insights need more time
  const timeoutMs = feature === 'insights' ? 300000 : 60000;

  const response = await axios.post(
    settings.endpoint,
    payload,
    {
      timeout: timeoutMs,
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

// ═══════════════════════════════════════════════════════════════════════════
// LOCAL BERT NLP SERVICE  (provider: 'bert')
// Talks to the FastAPI service in bert_service/ over plain JSON HTTP.
//   chat     → POST /nlp/parse     { message }
//   insights → POST /nlp/insights  { health, finance, prev, notes }
// ═══════════════════════════════════════════════════════════════════════════

/** Pull the raw user message out of a chat prompt (handles clarification blocks). */
const extractBertChatMessage = (userPrompt) => {
  const text = String(userPrompt || '');
  if (/USER'S RESPONSE:/i.test(text) || /Original message:/i.test(text)) {
    const orig = text.match(/Original message:\s*"([^"]*)"/i)?.[1] || '';
    const resp = text.match(/USER'S RESPONSE:\s*"([^"]*)"/i)?.[1] || '';
    const combined = [orig, resp].filter(Boolean).join(' ').trim();
    if (combined) return combined;
  }
  return text.trim();
};

/** Grab the first balanced {…} JSON object appearing after `label` in a prompt. */
const grabJsonObjectAfter = (text, label) => {
  const idx = text.indexOf(label);
  if (idx === -1) return null;
  const after = text.slice(idx + label.length);
  const start = after.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < after.length; i++) {
    if (after[i] === '{') depth++;
    else if (after[i] === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(after.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
};

/** Best-effort extraction of structured insight inputs from the insights prompt. */
const extractBertInsightsData = (userPrompt) => {
  const text = String(userPrompt || '');
  const healthObj = grabJsonObjectAfter(text, 'HEALTH DATA:') || {};
  const financeObj = grabJsonObjectAfter(text, 'FINANCE DATA:') || {};
  return {
    health: Array.isArray(healthObj.metrics) ? healthObj.metrics : (Array.isArray(healthObj) ? healthObj : []),
    finance: Array.isArray(financeObj.transactions) ? financeObj.transactions : (Array.isArray(financeObj) ? financeObj : []),
  };
};

const callBertParse = async (message, feature = 'chat', context = null) => {
  const endpoint = `${resolveBertEndpoint()}/nlp/parse`;
  const body = context ? { message, context } : { message };
  const { data } = await axios.post(
    endpoint,
    body,
    { timeout: getBertTimeoutMs(feature), headers: { 'Content-Type': 'application/json' } },
  );
  return data;
};

/** Direct, structured insights call — used by the insights service. */
const callBertInsights = async ({ health = [], finance = [], prev = {}, notes = [] } = {}) => {
  const endpoint = `${resolveBertEndpoint()}/nlp/insights`;
  const { data } = await axios.post(
    endpoint,
    { health, finance, prev, notes },
    { timeout: getBertTimeoutMs('insights'), headers: { 'Content-Type': 'application/json' } },
  );
  return data;
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
  context = null,
}) => {
  const provider = getProvider(feature);

  if (provider === 'bert') {
    try {
      const data = feature === 'insights'
        ? await callBertInsights(extractBertInsightsData(userPrompt))
        : await callBertParse(extractBertChatMessage(userPrompt), feature, context);
      return {
        provider: 'bert',
        model: getProviderSettings('bert').model,
        rawText: JSON.stringify(data),
        data,
        response: data,
      };
    } catch (bertError) {
      if (isStrictBertMode()) throw bertError;

      // Auto-fallback to Gemini if the local BERT service is down and a key exists
      const geminiKey = process.env.GEMINI_API_KEY;
      if (geminiKey && geminiKey.trim()) {
        console.warn(`BERT service failed (${bertError.message}), falling back to Gemini`);
        return callGemini({
          systemInstruction, userPrompt, responseSchema, temperature, maxOutputTokens,
          providerOverride: 'gemini',
        });
      }
      throw bertError; // No fallback available — surfaces as AI_UNAVAILABLE
    }
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

  if (provider === 'huggingface' || provider === 'groq' || provider === 'ollama') {
    return callOpenAICompatible({ systemInstruction, userPrompt, temperature, maxOutputTokens, providerOverride: provider, feature });
  }

  return callGemini({ systemInstruction, userPrompt, responseSchema, temperature, maxOutputTokens, providerOverride: provider });
};

module.exports = {
  generateStructuredJson,
  normalizeEntities,
  callBertInsights,
  _resolveAIProvider: resolveAIProvider,
  _getProvider: getProvider,
  _getProviderSettings: getProviderSettings,
  _extractResponseText: extractGeminiText,
  _parseModelTagOutput: parseModelTagOutput,
  _resolveCustomHFModelName: resolveCustomHFModelName,
  _isStrictCustomHFMode: isStrictCustomHFMode,
  _resolveBertEndpoint: resolveBertEndpoint,
  _isStrictBertMode: isStrictBertMode,
  _extractBertChatMessage: extractBertChatMessage,
  _extractBertInsightsData: extractBertInsightsData,
};
