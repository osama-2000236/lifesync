// tests/providerClientStream.test.js
// Real-time voice/chat: token-by-token streaming from OpenAI-compatible
// providers (OpenRouter, the local/custom runtime), with a non-streaming
// fallback for providers that don't expose an SSE token stream.

jest.mock('axios', () => ({ post: jest.fn() }));

const axios = require('axios');
const { EventEmitter } = require('events');
const { generateChatStream } = require('../server/services/ai/providerClient');

const sseStream = (lines) => {
  const stream = new EventEmitter();
  process.nextTick(() => {
    for (const line of lines) stream.emit('data', Buffer.from(`${line}\n`));
    stream.emit('end');
  });
  return stream;
};

describe('generateChatStream', () => {
  const originalEnv = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    CHAT_STREAM_STALL_MS: process.env.CHAT_STREAM_STALL_MS,
  };

  afterEach(() => {
    jest.clearAllMocks();
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });

  test('streams token deltas and resolves the full text for OpenRouter', async () => {
    process.env.OPENROUTER_API_KEY = 'or-test-key';
    const lines = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: ', world' } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: '!' } }] })}`,
      'data: [DONE]',
    ];
    axios.post.mockResolvedValue({ data: sseStream(lines) });

    const seen = [];
    const result = await generateChatStream({
      messages: [{ role: 'user', content: 'hi' }],
      providerOverride: 'openrouter',
      onDelta: (d) => seen.push(d),
    });

    expect(seen).toEqual(['Hello', ', world', '!']);
    expect(result.text).toBe('Hello, world!');
    expect(result.provider).toBe('openrouter');

    const [, payload, config] = axios.post.mock.calls[0];
    expect(payload.stream).toBe(true);
    expect(config.responseType).toBe('stream');
  });

  test('throws when the streamed response never yields any content', async () => {
    process.env.OPENROUTER_API_KEY = 'or-test-key';
    axios.post.mockResolvedValue({ data: sseStream(['data: [DONE]']) });

    await expect(generateChatStream({
      messages: [{ role: 'user', content: 'hi' }],
      providerOverride: 'openrouter',
    })).rejects.toThrow(/Empty streamed response/);
  });

  test('a barge-in abort with zero tokens received throws a distinct, non-misleading error', async () => {
    process.env.OPENROUTER_API_KEY = 'or-test-key';
    axios.post.mockResolvedValue({ data: sseStream(['data: [DONE]']) });
    const controller = new AbortController();
    controller.abort();

    await expect(generateChatStream({
      messages: [{ role: 'user', content: 'hi' }],
      providerOverride: 'openrouter',
      signal: controller.signal,
    })).rejects.toThrow(/aborted/);
  });

  test('ignores malformed SSE lines and keeps streaming valid ones', async () => {
    process.env.OPENROUTER_API_KEY = 'or-test-key';
    const lines = [
      'data: {not json',
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' } }] })}`,
      'data: [DONE]',
    ];
    axios.post.mockResolvedValue({ data: sseStream(lines) });

    const result = await generateChatStream({
      messages: [{ role: 'user', content: 'hi' }],
      providerOverride: 'openrouter',
    });

    expect(result.text).toBe('ok');
  });

  test('a stream that goes silent mid-reply rejects with a retryable stall error', async () => {
    process.env.OPENROUTER_API_KEY = 'or-test-key';
    process.env.CHAT_STREAM_STALL_MS = '60';
    // Emits one token, then never ends — the watchdog must kill it.
    const stream = new EventEmitter();
    process.nextTick(() => {
      stream.emit('data', Buffer.from(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Hel' } }] })}\n`));
    });
    axios.post.mockResolvedValue({ data: stream });

    await expect(generateChatStream({
      messages: [{ role: 'user', content: 'hi' }],
      providerOverride: 'openrouter',
    })).rejects.toThrow(/stalled/);
  });

  test('falls back to a single non-streamed delta for providers without SSE support (gemini)', async () => {
    process.env.GEMINI_API_KEY = 'gem-test-key';
    axios.post.mockResolvedValue({
      data: { candidates: [{ content: { parts: [{ text: 'Hi there' }] } }] },
    });

    const seen = [];
    const result = await generateChatStream({
      messages: [{ role: 'user', content: 'hi' }],
      providerOverride: 'gemini',
      onDelta: (d) => seen.push(d),
    });

    expect(seen).toEqual(['Hi there']);
    expect(result.text).toBe('Hi there');
  });
});
