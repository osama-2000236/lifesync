// server/routes/voiceRoutes.js
// ============================================
// Voice surface for the assistant.
// ============================================
// Default voice path is browser-native (Web Speech API for STT, speechSynthesis
// for TTS) — zero server keys, works offline-ish, and the assistant reply still
// flows through the normal /api/chat/stream model path (BERT or any OpenRouter
// model). These endpoints prepare the server side:
//   GET  /api/voice/config      — secret-free capability + language snapshot
//   POST /api/voice/transcribe  — optional cloud STT proxy (off until configured)
// Wire a cloud STT provider (e.g. Groq/OpenAI Whisper) when you want
// transcription quality beyond the browser engine — see the stub below.
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

// True once a server-side STT provider + key is configured.
const cloudSttConfigured = () =>
  Boolean(process.env.VOICE_STT_API_KEY && process.env.VOICE_STT_ENDPOINT);

const sttModel = () => process.env.VOICE_STT_MODEL || 'whisper-large-v3';

// True once a server-side TTS provider + key is configured. The browser's
// speechSynthesis is the default voice; this cloud path exists ONLY as a
// fallback for languages the device has no local voice for — most notably
// Arabic on Windows/Chrome, which ships no ar-* voice, so an Arabic reply is
// otherwise silent or read (garbled) by an English voice.
const cloudTtsConfigured = () =>
  Boolean(process.env.VOICE_TTS_API_KEY && process.env.VOICE_TTS_ENDPOINT);

const ttsModel = () => process.env.VOICE_TTS_MODEL || 'tts-1';
// OpenAI-style TTS voices are language-agnostic (the model speaks the input
// language). One configurable default is enough; make it per-lang only if a
// provider needs distinct voice ids per language.
// ponytail: single env voice; add a lang→voice map only if a provider needs it.
const ttsVoice = () => process.env.VOICE_TTS_VOICE || 'alloy';
// Output container. 'wav' is the safe cross-provider default (OpenAI + Groq
// both accept it) and is REQUIRED by Groq's Orpheus models, which reject the
// OpenAI-default mp3. Override per provider if you want smaller mp3 payloads.
const ttsFormat = () => process.env.VOICE_TTS_FORMAT || 'wav';

// Forward text to an OpenAI-compatible /audio/speech endpoint and return the
// raw audio bytes + content-type. Separate from the route so it can be
// unit-tested with a mocked axios (same pattern as transcribeAudio).
// No `language` field: it isn't part of the /audio/speech contract (Groq 400s
// on it) — the model speaks the input text's language natively.
const synthesizeSpeech = async (text) => {
  const { data, headers } = await axios.post(
    process.env.VOICE_TTS_ENDPOINT,
    { model: ttsModel(), input: String(text), voice: ttsVoice(), response_format: ttsFormat() },
    {
      headers: { Authorization: `Bearer ${process.env.VOICE_TTS_API_KEY}` },
      responseType: 'arraybuffer',
      timeout: 30_000,
    },
  );
  return {
    buffer: Buffer.from(data),
    contentType: headers?.['content-type'] || 'audio/wav',
  };
};

// Forward an audio buffer to an OpenAI-compatible /audio/transcriptions endpoint.
// Kept separate from the route handler so it can be unit-tested with a mocked axios.
const transcribeAudio = async (buffer, filename, language) => {
  const form = new FormData();
  form.append('file', new Blob([buffer]), filename || 'audio.webm');
  form.append('model', sttModel());
  if (language) form.append('language', language);
  const { data } = await axios.post(process.env.VOICE_STT_ENDPOINT, form, {
    headers: { Authorization: `Bearer ${process.env.VOICE_STT_API_KEY}` },
    timeout: 30_000,
    maxBodyLength: Infinity,
  });
  return typeof data?.text === 'string' ? data.text : '';
};

// Public, secret-free snapshot so the client knows what to enable.
router.get('/config', (req, res) => success(res, {
  stt: { browser: true, cloud: cloudSttConfigured(), default: 'browser' },
  tts: { browser: true, cloud: cloudTtsConfigured(), default: 'browser' },
  languages: SUPPORTED_LANGUAGES,
  rtl_languages: ['ar'],
}, 'Voice config'));

// Server-side fallback transcription. The browser (Web Speech API) is the
// default path; the client only calls this when native STT is unavailable or
// low-confidence. Disabled (501) until VOICE_STT_* env vars are set, so the key
// never reaches the browser. Multipart field: `file` (audio blob), `language`.
router.post('/transcribe', authenticate, upload.single('file'), async (req, res) => {
  if (!cloudSttConfigured()) {
    return error(
      res,
      'Cloud transcription is not configured. The browser microphone (Web Speech API) is used by default. Set VOICE_STT_ENDPOINT + VOICE_STT_API_KEY to enable server-side STT.',
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
    return error(res, 'Transcription failed. Falling back to the browser microphone.', 502, 'VOICE_STT_UPSTREAM_ERROR');
  }
});

// Server-side TTS fallback. The client uses the browser's speechSynthesis by
// default and only calls this when the device has NO local voice for the reply
// language (Arabic on Windows/Chrome). Returns audio bytes the client plays
// directly. Disabled (501) until VOICE_TTS_* env vars are set, so the key never
// reaches the browser. JSON body: `text` (required), `language` (optional hint).
router.post('/speak', authenticate, async (req, res) => {
  if (!cloudTtsConfigured()) {
    return error(
      res,
      'Cloud text-to-speech is not configured. The browser voice (speechSynthesis) is used by default. Set VOICE_TTS_ENDPOINT + VOICE_TTS_API_KEY to enable server-side TTS for languages the device has no local voice for (e.g. Arabic on Windows).',
      501,
      'VOICE_TTS_NOT_CONFIGURED',
    );
  }
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) return error(res, 'No text provided.', 400, 'VOICE_TTS_NO_TEXT');
  // Cap input so a runaway reply can't request a huge synthesis (provider limit
  // is ~4096 chars; the client already chunks, this is defense in depth).
  if (text.length > 4096) return error(res, 'Text too long for synthesis.', 413, 'VOICE_TTS_TOO_LONG');
  try {
    const { buffer, contentType } = await synthesizeSpeech(text);
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'no-store');
    return res.send(buffer);
  } catch (err) {
    return error(res, 'Speech synthesis failed. Falling back to the browser voice.', 502, 'VOICE_TTS_UPSTREAM_ERROR');
  }
});

module.exports = router;
module.exports.transcribeAudio = transcribeAudio;
module.exports.cloudSttConfigured = cloudSttConfigured;
module.exports.synthesizeSpeech = synthesizeSpeech;
module.exports.cloudTtsConfigured = cloudTtsConfigured;
