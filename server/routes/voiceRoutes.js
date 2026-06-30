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
const { authenticate } = require('../middleware/auth');
const { success, error } = require('../utils/responseHelper');

const router = express.Router();

const SUPPORTED_LANGUAGES = [
  { code: 'en', stt: 'en-US', tts: 'en-US', label: 'English' },
  { code: 'ar', stt: 'ar-SA', tts: 'ar-SA', label: 'Arabic' },
];

// True once a server-side STT provider + key is configured.
const cloudSttConfigured = () =>
  Boolean(process.env.VOICE_STT_API_KEY && process.env.VOICE_STT_ENDPOINT);

// Public, secret-free snapshot so the client knows what to enable.
router.get('/config', (req, res) => success(res, {
  stt: { browser: true, cloud: cloudSttConfigured(), default: 'browser' },
  tts: { browser: true, cloud: false, default: 'browser' },
  languages: SUPPORTED_LANGUAGES,
  rtl_languages: ['ar'],
}, 'Voice config'));

// Optional cloud transcription. Disabled until VOICE_STT_* env vars are set.
// When enabling, add multipart handling (multer/busboy) and forward the audio
// to the OpenAI-compatible audio/transcriptions endpoint of your STT provider.
router.post('/transcribe', authenticate, async (req, res) => {
  if (!cloudSttConfigured()) {
    return error(
      res,
      'Cloud transcription is not configured. The browser microphone (Web Speech API) is used by default. Set VOICE_STT_ENDPOINT + VOICE_STT_API_KEY to enable server-side STT.',
      501,
      'VOICE_STT_NOT_CONFIGURED'
    );
  }
  // Placeholder for the cloud proxy. Implement when a provider is chosen so the
  // key never reaches the browser. Example target: Groq whisper-large-v3 at
  // https://api.groq.com/openai/v1/audio/transcriptions (multipart `file`).
  return error(res, 'Server-side transcription proxy not implemented yet.', 501, 'VOICE_STT_PENDING');
});

module.exports = router;
