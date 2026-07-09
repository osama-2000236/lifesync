// tests/voiceTranscribe.test.js
// ============================================
// Voice STT surface — GET /config + POST /transcribe (hybrid fallback proxy).
// Auth stubbed, axios (upstream STT provider) mocked. No DB needed.
// ============================================

jest.mock('../server/middleware/auth', () => ({
  authenticate: (req, _res, next) => { req.user = { id: 1 }; next(); },
}));
jest.mock('axios');

const express = require('express');
const request = require('supertest');
const axios = require('axios');
const voiceRoutes = require('../server/routes/voiceRoutes');

const app = express();
app.use(express.json());
app.use('/api/voice', voiceRoutes);

const ORIGINAL_ENV = { ...process.env };
const configure = () => {
  delete process.env.VOICE_STT_DISABLED;
  delete process.env.OPENROUTER_API_KEY; // prefer explicit STT for these tests
  process.env.VOICE_STT_ENDPOINT = 'https://stt.example/v1/audio/transcriptions';
  process.env.VOICE_STT_API_KEY = 'test-key';
};
const unconfigure = () => {
  delete process.env.VOICE_STT_ENDPOINT;
  delete process.env.VOICE_STT_API_KEY;
  delete process.env.VOICE_STT_MODEL;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_STT_MODEL;
  process.env.VOICE_STT_DISABLED = '1';
  process.env.VOICE_TTS_DISABLED = '1';
};

beforeEach(() => { jest.clearAllMocks(); unconfigure(); });
afterAll(() => { process.env = ORIGINAL_ENV; });

describe('GET /config', () => {
  test('reports browser-default, cloud off when unconfigured', async () => {
    const res = await request(app).get('/api/voice/config');
    expect(res.status).toBe(200);
    expect(res.body.data.stt).toMatchObject({ browser: true, cloud: false, default: 'browser' });
    expect(res.body.data.rtl_languages).toContain('ar');
    expect(res.body.data.languages.length).toBeGreaterThan(0);
  });

  test('reports cloud on when configured', async () => {
    configure();
    const res = await request(app).get('/api/voice/config');
    expect(res.body.data.stt.cloud).toBe(true);
  });

  test('reports cloud STT on when only OPENROUTER_API_KEY is set (auto Whisper)', async () => {
    delete process.env.VOICE_STT_DISABLED;
    delete process.env.VOICE_STT_ENDPOINT;
    delete process.env.VOICE_STT_API_KEY;
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    const res = await request(app).get('/api/voice/config');
    expect(res.body.data.stt.cloud).toBe(true);
    expect(res.body.data.stt.via).toBe('openrouter');
  });
});

describe('POST /transcribe', () => {
  test('501 when cloud STT not configured', async () => {
    const res = await request(app)
      .post('/api/voice/transcribe')
      .attach('file', Buffer.from('audio'), 'clip.webm');
    expect(res.status).toBe(501);
    expect(res.body.code).toBe('VOICE_STT_NOT_CONFIGURED');
  });

  test('400 when no audio file provided', async () => {
    configure();
    const res = await request(app).post('/api/voice/transcribe').field('language', 'en');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VOICE_STT_NO_AUDIO');
  });

  test('200 returns transcribed text on success', async () => {
    configure();
    axios.post.mockResolvedValue({ data: { text: 'hello world' } });
    const res = await request(app)
      .post('/api/voice/transcribe')
      .field('language', 'en')
      .attach('file', Buffer.from('fake-audio-bytes'), 'clip.webm');
    expect(res.status).toBe(200);
    expect(res.body.data.text).toBe('hello world');
    expect(axios.post).toHaveBeenCalledWith(
      process.env.VOICE_STT_ENDPOINT,
      expect.any(Object),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-key' }) }),
    );
  });

  test('502 when upstream provider fails', async () => {
    configure();
    axios.post.mockRejectedValue(new Error('upstream 500'));
    const res = await request(app)
      .post('/api/voice/transcribe')
      .attach('file', Buffer.from('fake-audio'), 'clip.webm');
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('VOICE_STT_UPSTREAM_ERROR');
  });
});

describe('POST /speak (cloud TTS fallback)', () => {
  const unconfigureTts = () => {
    delete process.env.VOICE_TTS_ENDPOINT;
    delete process.env.VOICE_TTS_API_KEY;
    delete process.env.VOICE_TTS_MODEL;
    delete process.env.VOICE_TTS_VOICE;
    delete process.env.VOICE_TTS_FORMAT;
    delete process.env.OPENROUTER_API_KEY;
    process.env.VOICE_TTS_DISABLED = '1';
  };
  const configureTts = () => {
    delete process.env.VOICE_TTS_DISABLED;
    delete process.env.OPENROUTER_API_KEY;
    process.env.VOICE_TTS_ENDPOINT = 'https://tts.example/v1/audio/speech';
    process.env.VOICE_TTS_API_KEY = 'test-tts-key';
  };
  beforeEach(unconfigureTts);

  test('config reports tts.cloud on only when configured', async () => {
    let res = await request(app).get('/api/voice/config');
    expect(res.body.data.tts).toMatchObject({ browser: true, cloud: false, default: 'browser' });
    configureTts();
    res = await request(app).get('/api/voice/config');
    expect(res.body.data.tts.cloud).toBe(true);
  });

  test('501 when cloud TTS not configured', async () => {
    const res = await request(app).post('/api/voice/speak').send({ text: 'مرحبا' });
    expect(res.status).toBe(501);
    expect(res.body.code).toBe('VOICE_TTS_NOT_CONFIGURED');
  });

  test('400 when no text provided', async () => {
    configureTts();
    const res = await request(app).post('/api/voice/speak').send({ text: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VOICE_TTS_NO_TEXT');
  });

  test('200 returns audio bytes on success', async () => {
    configureTts();
    axios.post.mockResolvedValue({ data: Buffer.from([1, 2, 3, 4]), headers: { 'content-type': 'audio/mpeg' } });
    const res = await request(app).post('/api/voice/speak').send({ text: 'مرحبا كيف حالك', language: 'ar' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('audio/mpeg');
    expect(res.body).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(axios.post).toHaveBeenCalledWith(
      process.env.VOICE_TTS_ENDPOINT,
      expect.objectContaining({ input: 'مرحبا كيف حالك', model: 'tts-1', voice: 'alloy', response_format: 'wav' }),
      expect.objectContaining({
        responseType: 'arraybuffer',
        headers: expect.objectContaining({ Authorization: 'Bearer test-tts-key' }),
      }),
    );
    // `language` must NOT be forwarded — Groq's /audio/speech 400s on it.
    expect(axios.post.mock.calls[0][1]).not.toHaveProperty('language');
  });

  test('502 when upstream synthesis fails', async () => {
    configureTts();
    axios.post.mockRejectedValue(new Error('upstream 500'));
    const res = await request(app).post('/api/voice/speak').send({ text: 'hello' });
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('VOICE_TTS_UPSTREAM_ERROR');
  });

  test('413 when text exceeds synthesis cap', async () => {
    configureTts();
    const res = await request(app).post('/api/voice/speak').send({ text: 'x'.repeat(4097) });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('VOICE_TTS_TOO_LONG');
  });

  test('honors VOICE_TTS_FORMAT=mp3 and defaults Content-Type when upstream omits it', async () => {
    configureTts();
    process.env.VOICE_TTS_FORMAT = 'mp3';
    axios.post.mockResolvedValue({ data: Buffer.from([9, 9]), headers: {} });
    const res = await request(app).post('/api/voice/speak').send({ text: 'hi' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio\/mpeg/);
    expect(axios.post.mock.calls[0][1].response_format).toBe('mp3');
  });

  test('contentTypeFromFormat maps known containers', () => {
    expect(voiceRoutes.contentTypeFromFormat('wav')).toBe('audio/wav');
    expect(voiceRoutes.contentTypeFromFormat('mp3')).toBe('audio/mpeg');
    expect(voiceRoutes.contentTypeFromFormat('opus')).toBe('audio/opus');
    expect(voiceRoutes.contentTypeFromFormat('unknown')).toBe('audio/wav');
  });
});

describe('transcribeAudio helper', () => {
  test('sends language + default model, returns text', async () => {
    configure();
    axios.post.mockResolvedValue({ data: { text: 'salam' } });
    const text = await voiceRoutes.transcribeAudio(Buffer.from('a'), 'a.webm', 'ar');
    expect(text).toBe('salam');
  });

  test('omits language when absent + honors custom model + empty text fallback', async () => {
    configure();
    process.env.VOICE_STT_MODEL = 'whisper-tiny';
    axios.post.mockResolvedValue({ data: {} }); // no text field
    const text = await voiceRoutes.transcribeAudio(Buffer.from('a'), undefined, undefined);
    expect(text).toBe('');
  });
});
