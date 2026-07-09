// server/routes/voiceRoutes.js
// ============================================
// Voice surface for the assistant.
// ============================================
// Default voice path is browser-native (Web Speech API for STT, speechSynthesis
// for TTS). Cloud fallbacks:
//   1) Explicit VOICE_STT_* / VOICE_TTS_* endpoints + keys
//   2) Auto: OPENROUTER_API_KEY → OpenRouter /audio/transcriptions + /audio/speech
//      (so Arabic works on desktop Chrome with the same key as chat)
//   GET  /api/voice/config      — secret-free capability + language snapshot
//   POST /api/voice/transcribe  — cloud STT proxy (key never reaches the browser)
//   POST /api/voice/speak       — cloud TTS proxy for languages without a local voice
const express = require('express');
const axios = require('axios');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { success, error } = require('../utils/responseHelper');

const router = express.Router();

// In-memory upload: audio clips are small and forwarded straight to the STT
// provider, so we never write them to disk. Cap at 25MB (provider limit).
// fileFilter rejects non-audio so random binaries never hit the STT upstream.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    const name = String(file.originalname || '').toLowerCase();
    const okMime = mime.startsWith('audio/') || mime === 'application/octet-stream' || mime === 'video/webm';
    const okExt = /\.(webm|wav|mp3|m4a|ogg|flac|mp4|mpeg|mpga)$/i.test(name);
    if (okMime || okExt) return cb(null, true);
    const err = new Error('Only audio files are accepted for transcription.');
    err.code = 'VOICE_STT_BAD_TYPE';
    return cb(err);
  },
});

const SUPPORTED_LANGUAGES = [
  { code: 'en', stt: 'en-US', tts: 'en-US', label: 'English' },
  { code: 'ar', stt: 'ar-SA', tts: 'ar-SA', label: 'Arabic' },
];

const openRouterBase = () =>
  (process.env.OPENROUTER_API_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');

const openRouterExtraHeaders = () => ({
  'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://lifesync.app',
  'X-Title': process.env.OPENROUTER_APP_NAME || 'LifeSync',
});

/**
 * Resolve STT provider: explicit VOICE_STT_* wins; else OPENROUTER_API_KEY.
 * Returns null when nothing is configured.
 */
const resolveStt = () => {
  if (process.env.VOICE_STT_DISABLED === '1') return null;
  if (process.env.VOICE_STT_API_KEY && process.env.VOICE_STT_ENDPOINT) {
    return {
      endpoint: process.env.VOICE_STT_ENDPOINT,
      apiKey: process.env.VOICE_STT_API_KEY,
      model: process.env.VOICE_STT_MODEL || 'whisper-large-v3',
      headers: {},
    };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return {
      endpoint: `${openRouterBase()}/audio/transcriptions`,
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.VOICE_STT_MODEL
        || process.env.OPENROUTER_STT_MODEL
        || 'openai/whisper-large-v3',
      headers: openRouterExtraHeaders(),
    };
  }
  return null;
};

/**
 * Resolve TTS provider: explicit VOICE_TTS_* wins; else OPENROUTER_API_KEY.
 * Default OpenRouter model is microsoft/mai-voice-2 (mp3 + neural AR/EN voices).
 * openai/gpt-4o-mini-tts is not on the speech catalog for many keys → 400.
 */
const resolveTts = () => {
  if (process.env.VOICE_TTS_DISABLED === '1') return null;
  if (process.env.VOICE_TTS_API_KEY && process.env.VOICE_TTS_ENDPOINT) {
    return {
      endpoint: process.env.VOICE_TTS_ENDPOINT,
      apiKey: process.env.VOICE_TTS_API_KEY,
      model: process.env.VOICE_TTS_MODEL || 'tts-1',
      headers: {},
    };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return {
      endpoint: `${openRouterBase()}/audio/speech`,
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.VOICE_TTS_MODEL
        || process.env.OPENROUTER_TTS_MODEL
        || 'microsoft/mai-voice-2',
      headers: openRouterExtraHeaders(),
    };
  }
  return null;
};

const cloudSttConfigured = () => Boolean(resolveStt());
const cloudTtsConfigured = () => Boolean(resolveTts());

// Voice id is provider-specific. Lang is used only for Microsoft Neural voices.
const ttsVoice = (language) => {
  if (process.env.VOICE_TTS_VOICE) return process.env.VOICE_TTS_VOICE;
  const model = String(resolveTts()?.model || '');
  const ar = String(language || '').toLowerCase().startsWith('ar');
  if (/mai-voice|microsoft\//i.test(model)) {
    return ar ? 'ar-SA-ZariyahNeural' : 'en-US-AvaNeural';
  }
  if (/kokoro/i.test(model)) return 'af_heart';
  return 'alloy';
};

// Format by provider: OpenRouter speech = mp3|pcm only; Groq Orpheus needs wav.
const ttsFormat = () => {
  if (process.env.VOICE_TTS_FORMAT) return process.env.VOICE_TTS_FORMAT;
  const cfg = resolveTts();
  const model = String(cfg?.model || '');
  const endpoint = String(cfg?.endpoint || '');
  if (/orpheus/i.test(model) || /groq\.com/i.test(endpoint)) return 'wav';
  if (/gemini/i.test(model) && /tts/i.test(model)) return 'pcm';
  if (/openrouter\.ai/i.test(endpoint)) return 'mp3';
  return 'wav';
};

// Map response_format → MIME when the upstream omits Content-Type.
const contentTypeFromFormat = (fmt) => {
  const f = String(fmt || 'wav').toLowerCase();
  if (f === 'mp3') return 'audio/mpeg';
  if (f === 'opus') return 'audio/opus';
  if (f === 'aac') return 'audio/aac';
  if (f === 'flac') return 'audio/flac';
  if (f === 'pcm') return 'audio/L16';
  return 'audio/wav';
};

// Forward text to an OpenAI-compatible /audio/speech endpoint and return the
// raw audio bytes + content-type. Separate from the route so it can be
// unit-tested with a mocked axios (same pattern as transcribeAudio).
// No `language` in the JSON body (Groq 400s on it) — language only picks voice.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const synthesizeSpeech = async (text, language) => {
  const cfg = resolveTts();
  if (!cfg) throw new Error('TTS not configured');
  const format = ttsFormat();
  const body = {
    model: cfg.model,
    input: String(text),
    voice: ttsVoice(language),
    response_format: format,
  };
  const opts = {
    headers: { Authorization: `Bearer ${cfg.apiKey}`, ...cfg.headers },
    responseType: 'arraybuffer',
    timeout: 30_000,
  };
  // One retry on 429/5xx — free/paid speech pools flap; 4xx stays hard fail.
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { data, headers } = await axios.post(cfg.endpoint, body, opts);
      const buffer = Buffer.from(data);
      if (!buffer.length) throw new Error('empty TTS audio');
      return {
        buffer,
        contentType: headers?.['content-type'] || contentTypeFromFormat(format),
      };
    } catch (err) {
      lastErr = err;
      const status = err?.response?.status;
      const retryable = !status || status === 429 || status >= 500;
      if (!retryable || attempt === 1) throw err;
      await sleep(400);
    }
  }
  throw lastErr;
};

// Forward an audio buffer to an OpenAI-compatible /audio/transcriptions endpoint.
// Kept separate from the route handler so it can be unit-tested with a mocked axios.
const transcribeAudio = async (buffer, filename, language) => {
  const cfg = resolveStt();
  if (!cfg) throw new Error('STT not configured');
  const form = new FormData();
  // Node 18+ FormData/Blob — OpenRouter accepts multipart webm from browsers.
  form.append('file', new Blob([buffer]), filename || 'audio.webm');
  form.append('model', cfg.model);
  if (language) form.append('language', language);
  const { data } = await axios.post(cfg.endpoint, form, {
    headers: { Authorization: `Bearer ${cfg.apiKey}`, ...cfg.headers },
    timeout: 30_000,
    maxBodyLength: Infinity,
  });
  return typeof data?.text === 'string' ? data.text : '';
};

// Public, secret-free snapshot so the client knows what to enable.
router.get('/config', (req, res) => success(res, {
  stt: {
    browser: true,
    cloud: cloudSttConfigured(),
    default: 'browser',
    // Hint for ops UIs (never the key).
    via: resolveStt()?.endpoint?.includes('openrouter') ? 'openrouter' : (cloudSttConfigured() ? 'custom' : null),
  },
  tts: {
    browser: true,
    cloud: cloudTtsConfigured(),
    default: 'browser',
    via: resolveTts()?.endpoint?.includes('openrouter') ? 'openrouter' : (cloudTtsConfigured() ? 'custom' : null),
  },
  languages: SUPPORTED_LANGUAGES,
  rtl_languages: ['ar'],
}, 'Voice config'));

// Server-side fallback transcription. The browser (Web Speech API) is the
// default path; the client only calls this when native STT is unavailable.
// Enabled via VOICE_STT_* or OPENROUTER_API_KEY (auto Whisper). Multipart: `file`.
router.post('/transcribe', authenticate, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const code = err.code === 'LIMIT_FILE_SIZE' ? 'VOICE_STT_TOO_LARGE' : (err.code || 'VOICE_STT_BAD_UPLOAD');
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return error(res, err.message || 'Invalid audio upload.', status, code);
    }
    return next();
  });
}, async (req, res) => {
  if (!cloudSttConfigured()) {
    return error(
      res,
      'Cloud transcription is not configured. Set VOICE_STT_ENDPOINT + VOICE_STT_API_KEY, or OPENROUTER_API_KEY for automatic Whisper via OpenRouter.',
      501,
      'VOICE_STT_NOT_CONFIGURED'
    );
  }
  if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
    return error(res, 'No audio file provided.', 400, 'VOICE_STT_NO_AUDIO');
  }
  try {
    const text = await transcribeAudio(req.file.buffer, req.file.originalname, req.body?.language);
    return success(res, { text }, 'Transcribed');
  } catch (err) {
    // Surface status for ops; never forward provider body (may contain keys).
    console.error('[voice/transcribe] upstream error', err?.response?.status || err?.message);
    return error(res, 'Transcription failed. Falling back to the browser microphone.', 502, 'VOICE_STT_UPSTREAM_ERROR');
  }
});

// Server-side TTS fallback for languages the device has no local voice for
// (Arabic on Windows/Chrome). Enabled via VOICE_TTS_* or OPENROUTER_API_KEY.
router.post('/speak', authenticate, async (req, res) => {
  if (!cloudTtsConfigured()) {
    return error(
      res,
      'Cloud text-to-speech is not configured. Set VOICE_TTS_ENDPOINT + VOICE_TTS_API_KEY, or OPENROUTER_API_KEY for automatic TTS via OpenRouter.',
      501,
      'VOICE_TTS_NOT_CONFIGURED',
    );
  }
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) return error(res, 'No text provided.', 400, 'VOICE_TTS_NO_TEXT');
  if (text.length > 4096) return error(res, 'Text too long for synthesis.', 413, 'VOICE_TTS_TOO_LONG');
  try {
    const { buffer, contentType } = await synthesizeSpeech(text, req.body?.language);
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'no-store');
    return res.send(buffer);
  } catch (err) {
    const detail = err?.response?.data
      ? Buffer.from(err.response.data).toString('utf8').slice(0, 200)
      : '';
    console.error('[voice/speak] upstream error', err?.response?.status || err?.message, detail);
    return error(res, 'Speech synthesis failed. Falling back to the browser voice.', 502, 'VOICE_TTS_UPSTREAM_ERROR');
  }
});

module.exports = router;
module.exports.transcribeAudio = transcribeAudio;
module.exports.cloudSttConfigured = cloudSttConfigured;
module.exports.synthesizeSpeech = synthesizeSpeech;
module.exports.cloudTtsConfigured = cloudTtsConfigured;
module.exports.contentTypeFromFormat = contentTypeFromFormat;
module.exports.ttsFormat = ttsFormat;
module.exports.ttsVoice = ttsVoice;
module.exports.resolveStt = resolveStt;
module.exports.resolveTts = resolveTts;
