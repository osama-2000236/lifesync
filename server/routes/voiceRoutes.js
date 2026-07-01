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
  tts: { browser: true, cloud: false, default: 'browser' },
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

module.exports = router;
module.exports.transcribeAudio = transcribeAudio;
module.exports.cloudSttConfigured = cloudSttConfigured;
