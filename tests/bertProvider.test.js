// tests/bertProvider.test.js
// ============================================
// Tests for the local BERT provider wiring in providerClient.
// ============================================

jest.mock('axios', () => ({ post: jest.fn() }));

const axios = require('axios');
const {
  generateStructuredJson,
  callBertInsights,
  _resolveBertEndpoint,
  _isStrictBertMode,
  _extractBertChatMessage,
  _extractBertInsightsData,
} = require('../server/services/ai/providerClient');

const ENV_KEYS = [
  'AI_PROVIDER', 'CHAT_AI_PROVIDER', 'INSIGHTS_AI_PROVIDER',
  'BERT_SERVICE_URL', 'BERT_STRICT', 'GEMINI_API_KEY', 'GEMINI_MODEL',
];

describe('BERT provider', () => {
  const original = {};
  beforeAll(() => ENV_KEYS.forEach((k) => { original[k] = process.env[k]; }));
  afterEach(() => {
    jest.clearAllMocks();
    ENV_KEYS.forEach((k) => {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    });
  });

  // ─── endpoint + strict resolution ───

  test('resolveBertEndpoint defaults and strips trailing slash', () => {
    delete process.env.BERT_SERVICE_URL;
    expect(_resolveBertEndpoint()).toBe('http://127.0.0.1:8088');
    process.env.BERT_SERVICE_URL = 'http://localhost:9000/';
    expect(_resolveBertEndpoint()).toBe('http://localhost:9000');
  });

  test('strict bert mode only when configured', () => {
    process.env.BERT_STRICT = 'true';
    expect(_isStrictBertMode()).toBe(true);
    process.env.BERT_STRICT = 'false';
    expect(_isStrictBertMode()).toBe(false);
  });

  // ─── prompt extractors ───

  test('extractBertChatMessage returns bare message', () => {
    expect(_extractBertChatMessage('how much did I spend?')).toBe('how much did I spend?');
  });

  test('extractBertChatMessage combines clarification context', () => {
    const prompt = `The user is responding to a clarification question.
- Original message: "I spent 10"
- Question asked: "What was it for?"
USER'S RESPONSE: "lunch"`;
    expect(_extractBertChatMessage(prompt)).toBe('I spent 10 lunch');
  });

  test('extractBertInsightsData pulls metrics + transactions arrays', () => {
    const prompt = `Analyze this.
HEALTH DATA:
{ "metrics": [{"type":"sleep","avg_value":7}], "period": {} }

FINANCE DATA:
{ "transactions": [{"type":"expense","total":50}], "period": {} }`;
    const { health, finance } = _extractBertInsightsData(prompt);
    expect(health).toEqual([{ type: 'sleep', avg_value: 7 }]);
    expect(finance).toEqual([{ type: 'expense', total: 50 }]);
  });

  // ─── chat routing ───

  test('routes chat to /nlp/parse and returns parsed data', async () => {
    process.env.CHAT_AI_PROVIDER = 'bert';
    process.env.BERT_SERVICE_URL = 'http://127.0.0.1:8088';

    axios.post.mockResolvedValue({
      data: {
        intent: 'query_finance', domain: 'finance', entities: [],
        response: 'Check the Finance tab.', confidence: 0.82,
        needs_clarification: false, is_cross_domain: false,
        clarification_question: '', clarification_options: [],
      },
    });

    const result = await generateStructuredJson({
      systemInstruction: 'sys', userPrompt: 'how much did I spend this week?', feature: 'chat',
    });

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, body] = axios.post.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8088/nlp/parse');
    expect(body).toEqual({ message: 'how much did I spend this week?' });
    expect(result.provider).toBe('bert');
    expect(result.data.intent).toBe('query_finance');
  });

  // ─── insights routing ───

  test('routes insights to /nlp/insights with extracted data', async () => {
    process.env.INSIGHTS_AI_PROVIDER = 'bert';
    process.env.BERT_SERVICE_URL = 'http://127.0.0.1:8088';

    axios.post.mockResolvedValue({
      data: { summary: 'Steady week.', mood_sentiment: 'neutral', health_score: 60, model_used: 'distilbert' },
    });

    const prompt = `HEALTH DATA:
{ "metrics": [{"type":"sleep","avg_value":6}] }

FINANCE DATA:
{ "transactions": [{"type":"expense","total":100}] }`;

    const result = await generateStructuredJson({
      systemInstruction: 'sys', userPrompt: prompt, feature: 'insights',
    });

    const [url, body] = axios.post.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8088/nlp/insights');
    expect(body.health).toEqual([{ type: 'sleep', avg_value: 6 }]);
    expect(body.finance).toEqual([{ type: 'expense', total: 100 }]);
    expect(result.data.mood_sentiment).toBe('neutral');
  });

  // ─── fallback + strict ───

  test('falls back to Gemini when BERT is down and a key exists', async () => {
    process.env.CHAT_AI_PROVIDER = 'bert';
    process.env.GEMINI_API_KEY = 'gem-key';
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';
    delete process.env.BERT_STRICT;

    axios.post
      .mockRejectedValueOnce(new Error('ECONNREFUSED 127.0.0.1:8088'))
      .mockResolvedValueOnce({
        data: { candidates: [{ content: { parts: [{ text: '{"intent":"query_general","entities":[]}' }] } }] },
      });

    const result = await generateStructuredJson({
      systemInstruction: 'sys', userPrompt: 'hello', responseSchema: { type: 'object', properties: {} }, feature: 'chat',
    });

    expect(axios.post).toHaveBeenCalledTimes(2); // bert (fail) → gemini (ok)
    expect(result.provider).toBe('gemini');
    expect(result.data.intent).toBe('query_general');
  });

  test('strict bert mode does NOT fall back to Gemini', async () => {
    process.env.CHAT_AI_PROVIDER = 'bert';
    process.env.BERT_STRICT = 'true';
    process.env.GEMINI_API_KEY = 'gem-key';

    axios.post.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(generateStructuredJson({
      systemInstruction: 'sys', userPrompt: 'hello', feature: 'chat',
    })).rejects.toThrow('ECONNREFUSED');

    expect(axios.post).toHaveBeenCalledTimes(1); // only bert, no gemini
  });

  // ─── direct insights helper ───

  test('callBertInsights posts structured payload', async () => {
    process.env.BERT_SERVICE_URL = 'http://127.0.0.1:8088';
    axios.post.mockResolvedValue({ data: { summary: 'ok', health_score: 70 } });

    const data = await callBertInsights({ health: [{ type: 'mood', avg_value: 8 }], finance: [], prev: {}, notes: ['great week'] });

    const [url, body] = axios.post.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8088/nlp/insights');
    expect(body.notes).toEqual(['great week']);
    expect(data.health_score).toBe(70);
  });
});
