import { test, expect, type APIRequestContext } from '@playwright/test';

const apiBase = (process.env.QA_API_URL || 'http://127.0.0.1:5000/api').replace(/\/api\/?$/, '');
const endpoint = (path: string) => `/api${path}`;
let token = '';
let api: APIRequestContext;

test.describe('LifeSync API contracts', () => {
  test.beforeAll(async ({ playwright }) => {
    const email = process.env.TEST_USER_EMAIL;
    const password = process.env.TEST_USER_PASSWORD;
    if (!email || !password) throw new Error('TEST_USER_EMAIL and TEST_USER_PASSWORD are required.');
    api = await playwright.request.newContext({ baseURL: apiBase });
    const response = await api.post(endpoint('/auth/login'), { data: { email, password } });
    expect(response.status()).toBe(200);
    const payload = await response.json();
    token = payload.data.accessToken;
  });

  test.afterAll(async () => api?.dispose());

  test('TC-API-001 @smoke health check is publicly available', async () => {
    const response = await api.get(endpoint('/health'));
    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, version: '2.0.0' });
  });

  test('TC-API-002 @security protected resources reject missing tokens', async () => {
    const response = await api.get(endpoint('/health-logs'));
    expect(response.status()).toBe(401);
  });

  test('TC-API-003 @security invalid login does not disclose account existence', async () => {
    const response = await api.post(endpoint('/auth/login'), {
      data: { email: 'absent@example.test', password: 'WrongPassword1' },
    });
    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'Invalid email or password.' });
  });

  test('TC-API-004 @ai local provider status is ready', async () => {
    const response = await api.get(endpoint('/ai/status'), { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload.data.chat).toMatchObject({
      provider: 'bert_local',
      configured_model: 'bert_best_model_10pct',
      local: true,
      status: 'ready',
      architecture: 'BertForSequenceClassification',
      long_context: {
        strategy: 'overlapping_chunks_hybrid_pooling',
        sequence_length: 128,
        chunk_stride: 32,
        max_chunks: 16,
      },
    });
    expect(payload.data.chat).not.toHaveProperty('apiKey');
  });

  test('TC-API-005 @crud health log lifecycle is consistent and idempotent on read', async () => {
    const headers = { Authorization: `Bearer ${token}` };
    const create = await api.post(endpoint('/health-logs'), { headers, data: { type: 'steps', value: 4321, source: 'api' } });
    expect(create.status()).toBe(201);
    const created = (await create.json()).data.entry;

    const firstRead = await api.get(endpoint(`/health-logs/${created.id}`), { headers });
    const secondRead = await api.get(endpoint(`/health-logs/${created.id}`), { headers });
    expect(firstRead.status()).toBe(200);
    expect(secondRead.status()).toBe(200);

    const update = await api.put(endpoint(`/health-logs/${created.id}`), { headers, data: { value: 5432 } });
    expect(update.status()).toBe(200);
    expect(Number((await update.json()).data.entry.value)).toBe(5432);

    const remove = await api.delete(endpoint(`/health-logs/${created.id}`), { headers });
    expect(remove.status()).toBe(200);
    expect((await api.get(endpoint(`/health-logs/${created.id}`), { headers })).status()).toBe(404);
  });

  test('TC-API-006 @boundary health validation rejects an unsupported metric', async () => {
    const response = await api.post(endpoint('/health-logs'), {
      headers: { Authorization: `Bearer ${token}` },
      data: { type: 'blood_pressure', value: 120 },
    });
    expect(response.status()).toBe(400);
  });

  test('TC-API-007 @crud finance log lifecycle preserves decimal amounts', async () => {
    const headers = { Authorization: `Bearer ${token}` };
    const create = await api.post(endpoint('/finance'), {
      headers,
      data: { type: 'expense', amount: 19.95, currency: 'USD', description: 'QA lunch', source: 'api' },
    });
    expect(create.status()).toBe(201);
    const created = (await create.json()).data.entry;

    const update = await api.put(endpoint(`/finance/${created.id}`), { headers, data: { amount: 21.5 } });
    expect(update.status()).toBe(200);
    expect(Number((await update.json()).data.entry.amount)).toBe(21.5);
    expect((await api.delete(endpoint(`/finance/${created.id}`), { headers })).status()).toBe(200);
  });

  test('TC-API-008 @boundary finance rejects zero amount', async () => {
    const response = await api.post(endpoint('/finance'), {
      headers: { Authorization: `Bearer ${token}` },
      data: { type: 'expense', amount: 0 },
    });
    expect(response.status()).toBe(400);
  });

  test('TC-API-009 @contract pagination has stable metadata', async () => {
    const response = await api.get(endpoint('/health-logs?page=1&limit=5'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      success: true,
      pagination: { page: 1, limit: 5 },
    });
    expect(Array.isArray(payload.data)).toBeTruthy();
  });

  test('TC-API-010 @ai dashboard returns deterministic metrics plus runtime evidence', async () => {
    const response = await api.get(endpoint('/insights'), {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 90_000,
    });
    expect(response.status()).toBe(200);
    const insights = (await response.json()).data.insights;
    expect(insights.health_score).toBeGreaterThanOrEqual(0);
    expect(insights.health_score).toBeLessThanOrEqual(100);
    expect(insights.model_runtime.operating_mode).toMatch(/local_model|bert_classifier|deterministic_fallback/);
  });

  test('TC-API-011 @negative chat rejects an empty message', async () => {
    const response = await api.post(endpoint('/chat'), {
      headers: { Authorization: `Bearer ${token}` },
      data: { message: '' },
    });
    expect(response.status()).toBe(400);
  });

  test('TC-API-012 @ai chat returns one normalized response', async () => {
    const response = await api.post(endpoint('/chat'), {
      headers: { Authorization: `Bearer ${token}` },
      data: { message: 'I slept 7 hours last night.' },
      timeout: 90_000,
    });
    expect(response.status()).toBe(200);
    const data = (await response.json()).data;
    expect(data).toMatchObject({
      session_id: expect.any(String),
      intent: expect.any(String),
      domain: expect.any(String),
      response: expect.any(String),
      entities_logged: expect.any(Object),
    });
  });

  test('TC-API-013 @ai BERT combines budget, nutrition, mood, and stored context', async () => {
    const response = await api.post(endpoint('/chat'), {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        message: 'I have 20 ILS. What should I buy for healthy food and a better mood?',
      },
    });
    expect(response.status()).toBe(200);
    const data = (await response.json()).data;
    expect(data).toMatchObject({
      intent: 'get_insight',
      domain: 'both',
      is_cross_domain: true,
      needs_clarification: false,
      entities_logged: { health: [], finance: [], linked: [] },
    });
    expect(data.response).toContain('For ILS 20');
    expect(data.response).toContain('Food cannot guarantee a better mood');
  });
});
