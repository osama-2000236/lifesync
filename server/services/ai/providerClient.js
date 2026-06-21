const axios = require('axios');
require('dotenv').config();

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const HF_API_BASE_URL = 'https://api-inference.huggingface.co/v1';
const GROQ_API_BASE_URL = 'https://api.groq.com/openai/v1';
const SUPPORTED_PROVIDERS = new Set(['gemini', 'huggingface', 'groq', 'custom_hf', 'ollama', 'lmstudio', 'bert_local']);
const runtimeProviderOverrides = new Map();

const normalizeProvider = (value) => value?.trim().toLowerCase() || '';

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

const getProviderSettings = (providerOverride) => {
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

  // LM Studio implements OpenAI-compatible structured output. Constraining the
  // response here sharply reduces malformed JSON without coupling app code to
  // a particular GGUF model or chat template.
  if (['lmstudio', 'ollama'].includes(settings.provider) && responseSchema) {
    payload.response_format = {
      type: 'json_schema',
      json_schema: {
        name: feature === 'insights' ? 'lifesync_insights' : 'lifesync_nlp',
        strict: true,
        schema: responseSchema,
      },
    };
  }

  const response = await axios.post(
    settings.endpoint,
    payload,
    {
      timeout: settings.provider === 'lmstudio'
        ? (parseInt(process.env.LM_STUDIO_REQUEST_TIMEOUT_MS, 10) || 180000)
        : 60000,
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
const callCustomHF = async (systemMsg, userMsg) => {
  const BASE = (process.env.CUSTOM_HF_ENDPOINT ||
    'https://os-1202883-lifesync-api.hf.space').replace(/\/$/, '');
  const QUEUE = `${BASE}/gradio_api/call/infer`;
  const TEMP = parseFloat(process.env.CUSTOM_HF_TEMPERATURE) || 0.1;
  const MAXT = parseInt(process.env.CUSTOM_HF_MAX_TOKENS) || 512;

  const headers = { 'Content-Type': 'application/json' };
  const hfKey = process.env.HF_API_KEY;
  if (hfKey && hfKey.trim()) headers['Authorization'] = `Bearer ${hfKey.trim()}`;

  const MAX_RETRIES = 1;
  const BACKOFF_BASE_MS = 3000;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Step 1 — queue
      const qRes = await fetch(QUEUE, {
        method: 'POST',
        headers,
        body: JSON.stringify({ data: [systemMsg, userMsg, TEMP, MAXT] }),
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
        signal: AbortSignal.timeout(45_000),
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
// Auto-fallback: if custom_hf fails/times out AND a Gemini key exists, retry with Gemini.
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
      const parsed = await callCustomHF(systemInstruction || '', userPrompt);
      return {
        provider: 'custom_hf',
        model: 'os-1202883/LifeSync',
        rawText: JSON.stringify(parsed),
        data: parsed,
        response: parsed,
      };
    } catch (hfError) {
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

  if (provider === 'huggingface' || provider === 'groq' || provider === 'ollama' || provider === 'lmstudio') {
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
  classifyText,
  getAIProviderStatus,
  normalizeEntities,
  _resolveAIProvider: resolveAIProvider,
  _getProvider: getProvider,
  _getProviderSettings: getProviderSettings,
  _setRuntimeProvider: setRuntimeProvider,
  _clearRuntimeProvider: clearRuntimeProvider,
  _extractResponseText: extractGeminiText,
  _parseModelTagOutput: parseModelTagOutput,
};
