// tests/crossDomainInterviewService.test.js
// ============================================
// Cross-Domain Interview Service — full coverage
// Pure logic + DB-backed helpers (sqlite in-memory, mocked Insight Engine).
// ============================================

jest.mock('../server/config/database', () => {
  const { Sequelize } = require('sequelize');
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
    define: { timestamps: true, underscored: true, freezeTableName: true },
  });
  return { sequelize, testConnection: jest.fn() };
});

jest.mock('../server/services/ai/insightEngine', () => ({
  runInsightEngine: jest.fn(),
}));

const { sequelize } = require('../server/config/database');
require('../server/models'); // register all models (users, etc.) + associations
const { runInsightEngine } = require('../server/services/ai/insightEngine');
const HealthLog = require('../server/models/HealthLog');
const FinancialLog = require('../server/models/FinancialLog');
const LinkedDomain = require('../server/models/LinkedDomain');
const UserMemory = require('../server/models/UserMemory');
const svc = require('../server/services/ai/crossDomainInterviewService');

beforeAll(async () => {
  await sequelize.sync({ force: true });
  await sequelize.query(
    "INSERT INTO users (id, username, email, verified_email, is_active, created_at, updated_at) VALUES (1, 'u', 'u@t.com', 1, 1, datetime('now'), datetime('now'))"
  );
});
afterAll(async () => { await sequelize.close(); });
beforeEach(async () => {
  jest.clearAllMocks();
  await HealthLog.destroy({ where: {}, truncate: true });
  await FinancialLog.destroy({ where: {}, truncate: true });
  await LinkedDomain.destroy({ where: {}, truncate: true });
  await UserMemory.destroy({ where: {}, truncate: true });
});

// ─── Pure helpers ───
describe('pure helpers', () => {
  test('isValidTopic', () => {
    expect(svc.isValidTopic('sleep_spending')).toBe(true);
    expect(svc.isValidTopic('nope')).toBe(false);
  });

  test('totalSteps + isCrossDomain', () => {
    expect(svc.totalSteps('sleep_spending')).toBe(2);
    expect(svc.totalSteps('mood_nutrition')).toBe(3);
    expect(svc.totalSteps('bad')).toBe(0);
    expect(svc.isCrossDomain('sleep_spending')).toBe(true);
    expect(svc.isCrossDomain('mood_nutrition')).toBe(false);
    expect(svc.isCrossDomain('bad')).toBe(false);
  });

  test('getPrompt localizes + falls back', () => {
    expect(svc.getPrompt('sleep_spending', 'en')).toMatch(/sleep and spending/i);
    expect(svc.getPrompt('sleep_spending', 'ar')).toMatch(/نوم/);
    expect(svc.getPrompt('sleep_spending', 'fr')).toMatch(/sleep and spending/i); // fallback to en
    expect(svc.getPrompt('bad', 'en')).toBe('');
  });

  test('nextQuestion', () => {
    const q0 = svc.nextQuestion('sleep_spending', 0, 'en');
    expect(q0).toMatchObject({ id: 'sleep_hours', step: 0, total: 2, input_type: 'number' });
    expect(q0.options).toEqual([]);
    expect(svc.nextQuestion('sleep_spending', 0, 'ar').prompt).toMatch(/نمت/);
    const choiceQ = svc.nextQuestion('mood_nutrition', 2, 'en');
    expect(choiceQ.input_type).toBe('choice');
    expect(choiceQ.options.length).toBe(3);
    expect(choiceQ.options[0]).toMatchObject({ value: 'healthy' });
    expect(svc.nextQuestion('sleep_spending', 5, 'en')).toBeNull();
    expect(svc.nextQuestion('sleep_spending', -1, 'en')).toBeNull();
    expect(svc.nextQuestion('bad', 0, 'en')).toBeNull();
  });

  test('mapAnswerToEntities — number/health', () => {
    expect(svc.mapAnswerToEntities('sleep_spending', 0, 7.5))
      .toEqual({ domain: 'health', type: 'sleep', value: 7.5, unit: 'hours' });
  });

  test('mapAnswerToEntities — finance + rounding', () => {
    expect(svc.mapAnswerToEntities('sleep_spending', 1, 42.239))
      .toMatchObject({ domain: 'finance', type: 'expense', amount: 42.24, currency: 'USD' });
  });

  test('mapAnswerToEntities — exercise duration branch', () => {
    expect(svc.mapAnswerToEntities('activity_mood', 0, 30))
      .toEqual({ domain: 'health', type: 'exercise', value: 30, unit: 'minutes', duration: 30 });
  });

  test('mapAnswerToEntities — choice valid/invalid', () => {
    expect(svc.mapAnswerToEntities('mood_nutrition', 2, 'healthy'))
      .toEqual({ domain: 'health', type: 'nutrition', value: 3, value_text: 'healthy', unit: 'rating' });
    expect(svc.mapAnswerToEntities('mood_nutrition', 2, 'bogus')).toBeNull();
  });

  test('mapAnswerToEntities — numeric bounds + NaN + string coercion', () => {
    expect(svc.mapAnswerToEntities('sleep_spending', 0, '8')).toMatchObject({ value: 8 });
    expect(svc.mapAnswerToEntities('sleep_spending', 0, 'abc')).toBeNull(); // NaN
    expect(svc.mapAnswerToEntities('sleep_spending', 0, -1)).toBeNull();    // below min
    expect(svc.mapAnswerToEntities('sleep_spending', 0, 25)).toBeNull();    // above max
  });

  test('mapAnswerToEntities — invalid topic/step', () => {
    expect(svc.mapAnswerToEntities('bad', 0, 1)).toBeNull();
    expect(svc.mapAnswerToEntities('sleep_spending', 9, 1)).toBeNull();
  });

  test('selectTopic — concerning pattern wins', () => {
    const engine = { patterns: [{ severity: 'concerning', domain: 'both' }], recommendations: [] };
    expect(svc.selectTopic(engine, { sleep: 9, expense: 9 }, [])).toBe('sleep_spending');
  });

  test('selectTopic — concerning but blocked → gap fallback', () => {
    const engine = { patterns: [{ severity: 'concerning', domain: 'both' }] };
    // sleep_spending blocked; mood_nutrition has zero points → chosen
    expect(svc.selectTopic(engine, {}, ['sleep_spending'])).toBe('mood_nutrition');
  });

  test('selectTopic — biggest gap wins', () => {
    const counts = { sleep: 5, expense: 5, mood: 0, water: 0, nutrition: 0, exercise: 5, income: 5 };
    expect(svc.selectTopic(null, counts, [])).toBe('mood_nutrition');
  });

  test('selectTopic — rich data returns null', () => {
    const counts = { sleep: 9, expense: 9, mood: 9, water: 9, nutrition: 9, exercise: 9, income: 9 };
    expect(svc.selectTopic({ patterns: [] }, counts, [])).toBeNull();
  });

  test('selectTopic — all dismissed returns null', () => {
    expect(svc.selectTopic(null, {}, svc.TOPICS)).toBeNull();
  });

  test('selectTopic — default params (no counts/dismissed)', () => {
    expect(svc.selectTopic(null)).toBe('sleep_spending');
  });
});

// ─── DB-backed helpers ───
describe('db-backed helpers', () => {
  test('gatherCounts aggregates recent logs by type', async () => {
    await HealthLog.create({ user_id: 1, type: 'sleep', value: 7, logged_at: new Date() });
    await HealthLog.create({ user_id: 1, type: 'mood', value: 6, logged_at: new Date() });
    await FinancialLog.create({ user_id: 1, type: 'expense', amount: 10, logged_at: new Date() });
    const counts = await svc.gatherCounts(1);
    expect(counts.sleep).toBe(1);
    expect(counts.mood).toBe(1);
    expect(counts.expense).toBe(1);
    expect(counts.income).toBe(0);
  });

  test('recordDismissal + getDismissedTopics (create, update, invalid)', async () => {
    expect(await svc.recordDismissal(1, 'bad_topic')).toBeNull();
    await svc.recordDismissal(1, 'sleep_spending');
    await svc.recordDismissal(1, 'sleep_spending'); // update path
    const dismissed = await svc.getDismissedTopics(1);
    expect(dismissed).toContain('sleep_spending');
  });

  test('pickTopic — concerning pattern path', async () => {
    runInsightEngine.mockResolvedValue({ patterns: [{ severity: 'concerning', domain: 'both' }], recommendations: [] });
    const s = await svc.pickTopic(1); // default lang branch
    expect(s).toMatchObject({ topic: 'sleep_spending', consent_required: true, cross_domain: true });
    expect(s.questions_count).toBe(2);
    expect(s.prompt).toBeTruthy();
  });

  test('pickTopic — engine failure still suggests a gap', async () => {
    runInsightEngine.mockRejectedValue(new Error('engine down'));
    const s = await svc.pickTopic(1, 'en');
    expect(svc.TOPICS).toContain(s.topic);
  });

  test('pickTopic — rich data + no concerning → null', async () => {
    runInsightEngine.mockResolvedValue({ patterns: [], recommendations: [] });
    const now = new Date();
    for (let i = 0; i < 9; i += 1) {
      await HealthLog.create({ user_id: 1, type: 'sleep', value: 7, logged_at: now });
      await HealthLog.create({ user_id: 1, type: 'mood', value: 7, logged_at: now });
      await HealthLog.create({ user_id: 1, type: 'water', value: 2, logged_at: now });
      await HealthLog.create({ user_id: 1, type: 'nutrition', value: 3, logged_at: now });
      await HealthLog.create({ user_id: 1, type: 'exercise', value: 30, duration: 30, logged_at: now });
      await FinancialLog.create({ user_id: 1, type: 'expense', amount: 10, logged_at: now });
      await FinancialLog.create({ user_id: 1, type: 'income', amount: 20, logged_at: now });
    }
    const s = await svc.pickTopic(1, 'en');
    expect(s).toEqual({ topic: null });
  });

  test('logAnswerEntities — health, finance, invalid', async () => {
    const h = await svc.logAnswerEntities(1, 'sleep_spending', 0, 8);
    expect(h).toMatchObject({ domain: 'health', type: 'sleep' });
    const f = await svc.logAnswerEntities(1, 'sleep_spending', 1, 25);
    expect(f).toMatchObject({ domain: 'finance', type: 'expense', amount: 25 });
    expect(await svc.logAnswerEntities(1, 'sleep_spending', 0, 999)).toBeNull(); // out of range
    expect(await HealthLog.count()).toBe(1);
    expect(await FinancialLog.count()).toBe(1);
  });

  test('logAnswerEntities — choice (value_text) + exercise (duration) branches', async () => {
    const choice = await svc.logAnswerEntities(1, 'mood_nutrition', 2, 'healthy');
    expect(choice).toMatchObject({ domain: 'health', type: 'nutrition' });
    const ex = await svc.logAnswerEntities(1, 'activity_mood', 0, 45);
    expect(ex).toMatchObject({ domain: 'health', type: 'exercise' });
    const exRow = await HealthLog.findByPk(ex.id);
    expect(exRow.duration).toBe(45);
  });

  test('buildAdvice — relevant recommendations selected', async () => {
    runInsightEngine.mockResolvedValue({
      recommendations: [
        { text: 'Sleep 7+ hours', priority: 'high', domain: 'both', reason: 'r1' },
        { text: 'Move daily', priority: 'medium', domain: 'health' },
        { text: 'Unrelated', priority: 'low', domain: 'finance' },
      ],
      health_score: 72,
      financial_health_score: 60,
      cross_domain_insights: 'insight',
    });
    const advice = await svc.buildAdvice(1, 'sleep_spending'); // default lang branch
    expect(advice.advice.length).toBe(3);
    expect(advice.scores).toEqual({ health: 72, financial: 60 });
    expect(advice.cross_domain_insight).toBe('insight');
  });

  test('buildAdvice — fallback when no relevant recs', async () => {
    runInsightEngine.mockResolvedValue({ recommendations: [{ text: 'x', domain: 'finance' }], health_score: 1, financial_health_score: 1 });
    const advice = await svc.buildAdvice(1, 'mood_nutrition', 'ar');
    expect(advice.advice[0].priority).toBe('low');
    expect(advice.advice[0].text).toMatch(/سجّلت/);
  });

  test('buildAdvice — Arabic serves _ar mirrors, missing mirror falls back to English', async () => {
    runInsightEngine.mockResolvedValue({
      recommendations: [
        { text: 'Sleep 7+ hours', text_ar: 'نم ٧ ساعات', priority: 'high', domain: 'both', reason: 'r1', reason_ar: 'س1' },
        { text: 'No mirror here', priority: 'medium', domain: 'health', reason: 'r2' },
      ],
      health_score: 72,
      financial_health_score: 60,
      cross_domain_insights: 'insight',
      cross_domain_insights_ar: 'رؤية',
    });
    const advice = await svc.buildAdvice(1, 'sleep_spending', 'ar');
    expect(advice.advice[0].text).toBe('نم ٧ ساعات');
    expect(advice.advice[0].reason).toBe('س1');
    expect(advice.advice[1].text).toBe('No mirror here');
    expect(advice.advice[1].reason).toBe('r2');
    expect(advice.cross_domain_insight).toBe('رؤية');
  });

  test('buildAdvice — Arabic without _ar payload falls back to English insight', async () => {
    runInsightEngine.mockResolvedValue({
      recommendations: [{ text: 'tip', domain: 'both' }],
      health_score: 1,
      financial_health_score: 1,
      cross_domain_insights: 'english only',
    });
    const advice = await svc.buildAdvice(1, 'sleep_spending', 'ar');
    expect(advice.cross_domain_insight).toBe('english only');
    expect(advice.advice[0].text).toBe('tip');
  });

  test('buildAdvice — engine failure → fallback, null scores', async () => {
    runInsightEngine.mockRejectedValue(new Error('down'));
    const advice = await svc.buildAdvice(1, 'budget_savings', 'en');
    expect(advice.scores).toBeNull();
    expect(advice.advice.length).toBe(1);
  });

  test('buildAdvice — unknown topic uses default domain filter', async () => {
    runInsightEngine.mockResolvedValue({
      recommendations: [{ text: 'general tip', domain: 'both' }],
      health_score: 40, financial_health_score: 40,
    });
    const advice = await svc.buildAdvice(1, 'mystery_topic', 'en');
    expect(advice.advice[0].text).toBe('general tip');
  });

  test('finalizeInterview — cross-domain links + advice', async () => {
    runInsightEngine.mockResolvedValue({ recommendations: [], health_score: 50, financial_health_score: 50 });
    const h = await HealthLog.create({ user_id: 1, type: 'sleep', value: 6, logged_at: new Date() });
    const f = await FinancialLog.create({ user_id: 1, type: 'expense', amount: 30, logged_at: new Date() });
    const res = await svc.finalizeInterview(1, 'sleep_spending', { healthIds: [h.id], financeIds: [f.id] }); // default lang branch
    expect(res.links.length).toBe(1);
    expect(await LinkedDomain.count()).toBe(1);
    expect(res.advice.topic).toBe('sleep_spending');
  });

  test('finalizeInterview — non-cross-domain topic creates no link', async () => {
    runInsightEngine.mockResolvedValue({ recommendations: [] });
    const res = await svc.finalizeInterview(1, 'mood_nutrition', { healthIds: [1, 2], financeIds: [] }, 'en');
    expect(res.links.length).toBe(0);
    expect(await LinkedDomain.count()).toBe(0);
  });

  test('finalizeInterview — cross-domain topic but missing finance id skips link', async () => {
    runInsightEngine.mockResolvedValue({ recommendations: [] });
    const h = await HealthLog.create({ user_id: 1, type: 'sleep', value: 6, logged_at: new Date() });
    const res = await svc.finalizeInterview(1, 'sleep_spending', { healthIds: [h.id], financeIds: [] }, 'en');
    expect(res.links.length).toBe(0);
    expect(await LinkedDomain.count()).toBe(0);
  });

  test('finalizeInterview — explicit sourceMessage is persisted on the link', async () => {
    runInsightEngine.mockResolvedValue({ recommendations: [] });
    const h = await HealthLog.create({ user_id: 1, type: 'sleep', value: 6, logged_at: new Date() });
    const f = await FinancialLog.create({ user_id: 1, type: 'expense', amount: 30, logged_at: new Date() });
    const res = await svc.finalizeInterview(1, 'sleep_spending', { healthIds: [h.id], financeIds: [f.id], sourceMessage: 'custom source' }, 'en');
    expect(res.links.length).toBe(1);
    const link = await LinkedDomain.findByPk(res.links[0]);
    expect(link.source_message).toBe('custom source');
  });
});
