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
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
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
      // Prefer a model that speaks Arabic well; override with VOICE_TTS_MODEL.
      model: process.env.VOICE_TTS_MODEL
        || process.env.OPENROUTER_TTS_MODEL
        || 'openai/gpt-4o-mini-tts',
      headers: openRouterExtraHeaders(),
    };
  }
  return null;
};

const cloudSttConfigured = () => Boolean(resolveStt());
const cloudTtsConfigured = () => Boolean(resolveTts());

const ttsVoice = () => process.env.VOICE_TTS_VOICE || 'alloy';
// Output container. 'wav' is the safe cross-provider default (OpenAI + Groq
// both accept it) and is REQUIRED by Groq's Orpheus models, which reject the
// OpenAI-default mp3. Override per provider if you want smaller mp3 payloads.
const ttsFormat = () => process.env.VOICE_TTS_FORMAT || 'wav';

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
// No `language` field: it isn't part of the /audio/speech contract (Groq 400s
// on it) — the model speaks the input text's language natively.
const synthesizeSpeech = async (text) => {
  const cfg = resolveTts();
  if (!cfg) throw new Error('TTS not configured');
  const format = ttsFormat();
  const { data, headers } = await axios.post(
    cfg.endpoint,
    { model: cfg.model, input: String(text), voice: ttsVoice(), response_format: format },
    {
      headers: { Authorization: `Bearer ${cfg.apiKey}`, ...cfg.headers },
      responseType: 'arraybuffer',
      timeout: 30_000,
    },
  );
  return {
    buffer: Buffer.from(data),
    contentType: headers?.['content-type'] || contentTypeFromFormat(format),
  };
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
router.post('/transcribe', authenticate, upload.single('file'), async (req, res) => {
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
    const { buffer, contentType } = await synthesizeSpeech(text);
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'no-store');
    return res.send(buffer);
  } catch (err) {
    console.error('[voice/speak] upstream error', err?.response?.status || err?.message);
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
module.exports.resolveStt = resolveStt;
module.exports.resolveTts = resolveTts;
