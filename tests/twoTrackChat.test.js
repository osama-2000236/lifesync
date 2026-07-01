// tests/twoTrackChat.test.js
// Hybrid two-track chat: deterministic extraction + selected-model conversation,
// with seamless context transfer when switching models mid-conversation.

jest.mock('../server/services/ai/providerClient', () => ({
  classifyText: jest.fn(),
  generateChat: jest.fn(),
  generateStructuredJson: jest.fn(),
  _getProvider: jest.fn(() => 'bert_local'),
  _getProviderSettings: jest.fn(() => ({ provider: 'bert_local', model: 'x' })),
  _isStrictCustomHFMode: jest.fn(() => false),
}));

const { classifyText, generateChat } = require('../server/services/ai/providerClient');
const { parseMessage } = require('../server/services/ai/nlpService');
const { generateAssistantReply, _buildMessages, _buildSystemPrompt } = require('../server/services/ai/conversationService');

const ctx = (conversation = []) => ({
  conversation,
  profile: { name: 'Osama' },
  memory: { summary: 'has a car' },
  health: { sleep: { average: 7, count: 3 } },
  finance: {},
  source_counts: {},
});

beforeEach(() => {
  classifyText.mockResolvedValue({ label: 'general_chat', confidence: 0.9, provider: 'cpu', model: 'bert', latency_ms: 10 });
  generateChat.mockReset();
});

describe('conversationService', () => {
  test('builds a multi-turn messages array ending in the current message', () => {
    const messages = _buildMessages(
      [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }],
      'how am I doing?'
    );
    expect(messages).toHaveLength(3);
    expect(messages[2]).toEqual({ role: 'user', content: 'how am I doing?' });
  });

  test('system prompt grounds the model with memory + just-logged facts', () => {
    const sys = _buildSystemPrompt(ctx(), [{ domain: 'finance', type: 'expense', amount: 15, currency: 'USD', description: 'lunch' }]);
    expect(sys).toContain('Osama');
    expect(sys).toContain('has a car');
    expect(sys).toMatch(/already logged.*15/);
  });

  test('returns the generated text', async () => {
    generateChat.mockResolvedValue({ provider: 'openai', model: 'gpt', text: 'Hey Osama!' });
    const reply = await generateAssistantReply({ provider: 'openai', model: 'gpt', context: ctx(), loggedEntities: [], message: 'hi' });
    expect(reply).toMatchObject({ text: 'Hey Osama!', provider: 'openai' });
  });

  test('returns an error object (not throw) when the model fails', async () => {
    generateChat.mockRejectedValue(new Error('Anthropic API key is not configured.'));
    const reply = await generateAssistantReply({ provider: 'anthropic', context: ctx(), loggedEntities: [], message: 'hi' });
    expect(reply.error).toMatch(/API key/);
  });
});

describe('parseMessage two-track routing', () => {
  test('bert_local keeps the deterministic reply (no generative call)', async () => {
    const result = await parseMessage('I walked 8000 steps', null, ctx(), { provider: 'bert_local' });
    expect(result.intent).toBe('log_health');
    expect(result.entities[0]).toMatchObject({ type: 'steps', value: 8000 });
    expect(generateChat).not.toHaveBeenCalled();
  });

  test('generative provider overrides the reply with model prose but keeps logged entities', async () => {
    generateChat.mockResolvedValue({ provider: 'openai', model: 'gpt', text: 'Nice, 8k steps logged — great pace!' });
    const result = await parseMessage('I walked 8000 steps', null, ctx(), { provider: 'openai', model: 'gpt' });
    expect(result.entities[0]).toMatchObject({ type: 'steps', value: 8000 }); // Track A intact
    expect(result.response).toBe('Nice, 8k steps logged — great pace!'); // Track B reply
    expect(result.model_runtime).toMatchObject({ provider: 'openai', conversational: true, responder: 'generative' });
  });

  test('missing API key falls back to the deterministic reply gracefully', async () => {
    generateChat.mockRejectedValue(new Error('Anthropic API key is not configured.'));
    const result = await parseMessage('I walked 8000 steps', null, ctx(), { provider: 'anthropic', model: 'claude-opus-4-8' });
    expect(result.entities[0]).toMatchObject({ type: 'steps', value: 8000 });
    expect(result.response).toMatch(/logged/i); // deterministic reply
    expect(result.model_runtime).toMatchObject({ responder: 'deterministic_fallback', chat_provider: 'anthropic' });
  });

  test('an ambiguous turn still converses on a generative model (no canned chips, nothing logged)', async () => {
    generateChat.mockResolvedValue({ provider: 'openai', model: 'gpt', text: 'Was that $10 spent, or something else?' });
    const result = await parseMessage('I spent 10', null, ctx(), { provider: 'openai', model: 'gpt' });
    expect(generateChat).toHaveBeenCalledTimes(1);
    // The model is told about the detected ambiguity via the system prompt.
    expect(generateChat.mock.calls[0][0].system).toMatch(/ambiguous/i);
    expect(result.needs_clarification).toBe(false);
    expect(result.clarification_options).toEqual([]);
    expect(result.entities).toEqual([]); // ambiguous data is never logged
    expect(result.response).toMatch(/\$10/);
    expect(result.model_runtime).toMatchObject({ responder: 'generative' });
  });

  test('an ambiguous turn falls back to the clarification chips when the model fails', async () => {
    generateChat.mockRejectedValue(new Error('down'));
    const result = await parseMessage('I spent 10', null, ctx(), { provider: 'openai', model: 'gpt' });
    expect(result.needs_clarification).toBe(true);
    expect(result.clarification_question).toBeTruthy();
    expect(result.model_runtime).toMatchObject({ responder: 'deterministic_fallback' });
  });

  test('bert_local keeps the canned clarification flow', async () => {
    const result = await parseMessage('I spent 10', null, ctx(), { provider: 'bert_local' });
    expect(result.needs_clarification).toBe(true);
    expect(generateChat).not.toHaveBeenCalled();
  });

  test('history (conversation array) is forwarded so a switched model continues the thread', async () => {
    generateChat.mockResolvedValue({ provider: 'anthropic', model: 'sonnet', text: 'continuing...' });
    const history = [{ role: 'user', content: 'my budget is $1200' }, { role: 'assistant', content: 'noted' }];
    await parseMessage('what did I say my budget was?', null, ctx(history), { provider: 'anthropic', model: 'sonnet' });
    const sentMessages = generateChat.mock.calls[0][0].messages;
    expect(sentMessages.some((m) => m.content.includes('budget is $1200'))).toBe(true);
    expect(sentMessages[sentMessages.length - 1].content).toMatch(/what did I say/);
  });
});
