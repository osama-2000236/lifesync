// tests/openRouterFallbackChain.test.js
// ============================================
// OpenRouter server-side fallback (`models: [primary, backup]`) + usage
// telemetry. Honesty contract: the free tier never chains to a paid slug,
// and whatever slug actually serves is the slug we report.
// ============================================

jest.mock('axios', () => ({ post: jest.fn() }));
const axios = require('axios');
const {
  generateChat,
  _openRouterModels,
  _logOpenRouterUsage,
} = require('../server/services/ai/providerClient');

const GEMMA_FREE = 'google/gemma-4-31b-it:free';
const GEMMA_FLASH_FREE = 'google/gemma-4-26b-a4b-it:free';
const LLAMA_PAID = 'meta-llama/llama-3.3-70b-instruct';

beforeEach(() => {
  axios.post.mockReset();
  process.env.CHAT_AI_PROVIDER = 'openrouter';
  process.env.OPENROUTER_API_KEY = 'or-test-key';
  delete process.env.OPENROUTER_FALLBACK_MODEL;
});
afterEach(() => {
  delete process.env.CHAT_AI_PROVIDER;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_FALLBACK_MODEL;
});

describe('_openRouterModels chain', () => {
  test('free primary chains to the free default backup only', () => {
    expect(_openRouterModels(GEMMA_FREE)).toEqual([GEMMA_FREE, GEMMA_FLASH_FREE]);
  });

  test('paid primary chains to the llama default', () => {
    expect(_openRouterModels('openai/gpt-5.4-mini')).toEqual(['openai/gpt-5.4-mini', LLAMA_PAID]);
  });

  test('env override wins', () => {
    process.env.OPENROUTER_FALLBACK_MODEL = 'qwen/qwen-2.5-72b-instruct:free';
    expect(_openRouterModels(GEMMA_FREE)).toEqual([GEMMA_FREE, 'qwen/qwen-2.5-72b-instruct:free']);
  });

  test('a free pick NEVER chains to a paid backup (env misconfig ignored)', () => {
    process.env.OPENROUTER_FALLBACK_MODEL = LLAMA_PAID;
    expect(_openRouterModels(GEMMA_FREE)).toBeNull();
  });

  test('backup equal to primary → no chain', () => {
    process.env.OPENROUTER_FALLBACK_MODEL = GEMMA_FREE;
    expect(_openRouterModels(GEMMA_FREE)).toBeNull();
  });
});

describe('generateChat with the fallback chain', () => {
  test('request carries models:[primary, backup]; served slug is reported honestly', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        model: GEMMA_FLASH_FREE, // primary pool busy — backup served
        choices: [{ message: { content: 'served by backup' } }],
      },
    });
    const out = await generateChat({ system: 's', messages: [{ role: 'user', content: 'hi' }], model: GEMMA_FREE });
    const body = axios.post.mock.calls[0][1];
    expect(body.model).toBe(GEMMA_FREE);
    expect(body.models).toEqual([GEMMA_FREE, GEMMA_FLASH_FREE]);
    expect(out.text).toBe('served by backup');
    expect(out.model).toBe(GEMMA_FLASH_FREE); // never claim gemma-31b served
  });

  test('429 on the whole request stays retryable; the retry that returns 200 serves', async () => {
    const rateLimited = Object.assign(new Error('Request failed with status code 429'), {
      response: { status: 429, data: { error: { message: 'rate-limited upstream' } } },
    });
    axios.post
      .mockRejectedValueOnce(rateLimited)
      .mockResolvedValueOnce({
        data: { model: GEMMA_FREE, choices: [{ message: { content: 'recovered' } }] },
      });

    await expect(generateChat({ messages: [{ role: 'user', content: 'hi' }], model: GEMMA_FREE }))
      .rejects.toMatchObject({ retryable: true });
    const out = await generateChat({ messages: [{ role: 'user', content: 'hi' }], model: GEMMA_FREE });
    expect(out.text).toBe('recovered');
    expect(out.model).toBe(GEMMA_FREE);
  });
});

describe('usage telemetry', () => {
  test('successful call with usage emits one structured log line', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      axios.post.mockResolvedValueOnce({
        data: {
          model: GEMMA_FREE,
          usage: { prompt_tokens: 812, completion_tokens: 64, total_tokens: 876, cost: 0 },
          choices: [{ message: { content: 'ok' } }],
        },
      });
      await generateChat({ messages: [{ role: 'user', content: 'hi' }], model: GEMMA_FREE });
      const usageLines = spy.mock.calls.map((c) => c[0]).filter((l) => String(l).includes('openrouter_usage'));
      expect(usageLines).toHaveLength(1);
      const parsed = JSON.parse(usageLines[0]);
      expect(parsed).toMatchObject({
        evt: 'openrouter_usage',
        model: GEMMA_FREE,
        requested_model: GEMMA_FREE,
        prompt_tokens: 812,
        completion_tokens: 64,
        total_tokens: 876,
        cost: 0,
      });
    } finally {
      spy.mockRestore();
    }
  });

  test('no usage in the response → no log line; malformed data never throws', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      _logOpenRouterUsage(GEMMA_FREE, { model: GEMMA_FREE });
      _logOpenRouterUsage(GEMMA_FREE, null);
      expect(spy).not.toHaveBeenCalled();
      expect(() => _logOpenRouterUsage(GEMMA_FREE, { usage: {} })).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});
