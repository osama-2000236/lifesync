// tests/parseMessageStream.test.js
// Real-time voice assistant plumbing: Track B (generative reply) streams
// token-by-token through an onDelta callback, with a reasoning-block filter
// for local models that emit <think>...</think>, while Track A (deterministic
// entity extraction) stays exactly as before. Mirrors twoTrackChat.test.js's
// mocking pattern but exercises the streaming path.

jest.mock('../server/services/ai/providerClient', () => ({
  classifyText: jest.fn(),
  generateChat: jest.fn(),
  generateChatStream: jest.fn(),
  generateStructuredJson: jest.fn(),
  _getProvider: jest.fn(() => 'bert_local'),
  _getProviderSettings: jest.fn(() => ({ provider: 'bert_local', model: 'x' })),
  _isStrictCustomHFMode: jest.fn(() => false),
}));

const { classifyText, generateChat, generateChatStream } = require('../server/services/ai/providerClient');
const { parseMessage } = require('../server/services/ai/nlpService');
const {
  generateAssistantReplyStream,
  _makeReasoningFilter: makeReasoningFilter,
  _MAX_THINK_BUFFER: MAX_THINK_BUFFER,
} = require('../server/services/ai/conversationService');

const ctx = (conversation = []) => ({
  conversation,
  profile: { name: 'Osama' },
  memory: {},
  health: {},
  finance: {},
  source_counts: {},
});

// Paid slug so stream path runs (free slugs try non-stream first).
const PAID = 'openai/gpt-5.4-mini';

beforeEach(() => {
  classifyText.mockResolvedValue({ label: 'general_chat', confidence: 0.9, provider: 'cpu', model: 'bert', latency_ms: 10 });
  generateChat.mockReset();
  generateChatStream.mockReset();
});

describe('makeReasoningFilter (unit)', () => {
  test('swallows a <think>...</think> block split across chunk boundaries', () => {
    const seen = [];
    const filter = makeReasoningFilter((d) => seen.push(d));
    ['<thi', 'nk>reasoning about ', 'stuff</thin', 'k>Hello', ' world!'].forEach((c) => filter(c));
    expect(seen.join('')).toBe('Hello world!');
  });

  test('passes plain text straight through', () => {
    const seen = [];
    const filter = makeReasoningFilter((d) => seen.push(d));
    filter('No reasoning ');
    filter('here.');
    expect(seen).toEqual(['No reasoning ', 'here.']);
  });

  test('flushes when think block never closes past MAX_THINK_BUFFER', () => {
    const seen = [];
    const filter = makeReasoningFilter((d) => seen.push(d));
    filter(`<think>${'x'.repeat(MAX_THINK_BUFFER + 1)}`);
    expect(seen.join('').length).toBeGreaterThan(0);
  });
});

describe('generateAssistantReplyStream — reasoning filter', () => {
  test('swallows a <think>...</think> block split across chunk boundaries', async () => {
    generateChatStream.mockImplementation(async ({ onDelta }) => {
      onDelta('<thi');
      onDelta('nk>reasoning about ');
      onDelta('stuff</thin');
      onDelta('k>Hello');
      onDelta(' world!');
      return { provider: 'openrouter', model: PAID, text: '<think>reasoning about stuff</think>Hello world!' };
    });

    const seen = [];
    const reply = await generateAssistantReplyStream({
      provider: 'openrouter', model: PAID, context: ctx(), loggedEntities: [], message: 'hi',
      onDelta: (d) => seen.push(d),
    });

    expect(seen.join('')).toBe('Hello world!');
    expect(reply.text).toBe('Hello world!');
  });

  test('passes plain text straight through unfiltered', async () => {
    generateChatStream.mockImplementation(async ({ onDelta }) => {
      onDelta('No reasoning ');
      onDelta('here.');
      return { provider: 'openrouter', model: PAID, text: 'No reasoning here.' };
    });

    const seen = [];
    const reply = await generateAssistantReplyStream({
      provider: 'openrouter', model: PAID, context: ctx(), loggedEntities: [], message: 'hi',
      onDelta: (d) => seen.push(d),
    });

    expect(seen).toEqual(['No reasoning ', 'here.']);
    expect(reply.text).toBe('No reasoning here.');
  });

  test('gives up waiting and surfaces text if a <think> block never closes', async () => {
    const unclosed = `<think>${'x'.repeat(4001)}`;
    generateChatStream.mockImplementation(async ({ onDelta }) => {
      onDelta(unclosed);
      return { provider: 'openrouter', model: PAID, text: unclosed };
    });

    const seen = [];
    const reply = await generateAssistantReplyStream({
      provider: 'openrouter', model: PAID, context: ctx(), loggedEntities: [], message: 'hi',
      onDelta: (d) => seen.push(d),
    });

    // Never silently swallowed forever — something reaches the caller.
    expect(seen.join('').length).toBeGreaterThan(0);
    expect(reply.text.length).toBeGreaterThan(0);
  });

  test('missing model returns error (no silent empty stream)', async () => {
    const reply = await generateAssistantReplyStream({
      provider: 'openrouter', context: ctx(), loggedEntities: [], message: 'hi',
      onDelta: () => {},
    });
    expect(reply.error).toBeTruthy();
    expect(generateChatStream).not.toHaveBeenCalled();
  });
});

describe('parseMessage — streaming onDelta wiring', () => {
  test('forwards Track B chunks via onDelta and keeps Track A entities intact', async () => {
    generateChatStream.mockImplementation(async ({ onDelta }) => {
      onDelta('Nice, ');
      onDelta('8k steps logged!');
      return { provider: 'openrouter', model: 'gpt', text: 'Nice, 8k steps logged!' };
    });

    const chunks = [];
    const result = await parseMessage(
      'I walked 8000 steps', null, ctx(), { provider: 'openrouter', model: 'gpt' },
      (c) => chunks.push(c)
    );

    expect(result.entities[0]).toMatchObject({ type: 'steps', value: 8000 }); // Track A intact
    expect(chunks.join('')).toBe('Nice, 8k steps logged!');
    expect(result.response).toBe('Nice, 8k steps logged!');
    expect(result.model_runtime).toMatchObject({ responder: 'generative' });
  });

  test('bert_local emits the deterministic reply as a single delta (no generative call)', async () => {
    const chunks = [];
    const result = await parseMessage(
      'I walked 8000 steps', null, ctx(), { provider: 'bert_local' },
      (c) => chunks.push(c)
    );

    expect(generateChatStream).not.toHaveBeenCalled();
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(result.response);
  });

  test('a call without onDelta still uses the plain non-streaming path', async () => {
    generateChat.mockResolvedValue({ provider: 'openrouter', model: 'gpt', text: 'Plain reply' });

    const result = await parseMessage('I walked 8000 steps', null, ctx(), { provider: 'openrouter', model: 'gpt' });

    expect(generateChatStream).not.toHaveBeenCalled();
    expect(generateChat).toHaveBeenCalled();
    expect(result.response).toBe('Plain reply');
  });
});
