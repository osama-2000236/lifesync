// tests/voiceInterviewEval.test.js
// ============================================
// Voice interview + cloud voice QUALITY HARNESS (CI-gated).
// ============================================
// Floors for the proactive cross-domain interview (pure QUESTION_BANK mapping)
// and server voice surface contracts that the assistant studio depends on.
// Complements crossDomainInterviewService / voiceTranscribe unit suites with
// explicit mass coverage + bilingual prompt presence + full XD flow.

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
  runInsightEngine: jest.fn().mockResolvedValue({
    recommendations: [],
    health_score: 55,
    financial_health_score: 48,
    cross_domain_insights: 'Nothing strong linking health and money this week. Keep logging — links show up with more history.',
    cross_domain_insights_ar: 'لا رابط قوي بين الصحة والمال هذا الأسبوع. واصل التسجيل — تظهر الروابط مع المزيد من السجل.',
  }),
}));

const { sequelize } = require('../server/config/database');
require('../server/models');
const HealthLog = require('../server/models/HealthLog');
const FinancialLog = require('../server/models/FinancialLog');
const LinkedDomain = require('../server/models/LinkedDomain');
const UserMemory = require('../server/models/UserMemory');
const svc = require('../server/services/ai/crossDomainInterviewService');
const voiceRoutes = require('../server/routes/voiceRoutes');

const MIN_TOPICS = 4;
const MIN_QUESTIONS = 9; // 2+3+2+2

beforeAll(async () => {
  await sequelize.sync({ force: true });
  await sequelize.query(
    "INSERT INTO users (id, username, email, verified_email, is_active, created_at, updated_at) VALUES (1, 'vu', 'vu@t.com', 1, 1, datetime('now'), datetime('now'))"
  );
});
afterAll(async () => { await sequelize.close(); });
beforeEach(async () => {
  await HealthLog.destroy({ where: {}, truncate: true });
  await FinancialLog.destroy({ where: {}, truncate: true });
  await LinkedDomain.destroy({ where: {}, truncate: true });
  await UserMemory.destroy({ where: {}, truncate: true });
});

describe('voice interview bank mass + bilingual (floors)', () => {
  test('topic inventory meets floors', () => {
    expect(svc.TOPICS.length).toBeGreaterThanOrEqual(MIN_TOPICS);
    expect(svc.TOPICS).toEqual(expect.arrayContaining([
      'sleep_spending', 'mood_nutrition', 'activity_mood', 'budget_savings',
    ]));
    const qCount = svc.TOPICS.reduce((n, t) => n + svc.totalSteps(t), 0);
    expect(qCount).toBeGreaterThanOrEqual(MIN_QUESTIONS);
    // Exactly one true health+money cross-domain topic drives LinkedDomain.
    expect(svc.TOPICS.filter((t) => svc.isCrossDomain(t))).toEqual(['sleep_spending']);
  });

  test.each(svc.TOPICS.map((t) => [t]))('%s has en+ar prompts for consent + every step', (topic) => {
    const en = svc.getPrompt(topic, 'en');
    const ar = svc.getPrompt(topic, 'ar');
    expect(en.length).toBeGreaterThan(10);
    expect(ar.length).toBeGreaterThan(10);
    expect(ar).toMatch(/[\u0600-\u06FF]/); // Arabic script
    expect(en).not.toEqual(ar);
    for (let step = 0; step < svc.totalSteps(topic); step += 1) {
      const qEn = svc.nextQuestion(topic, step, 'en');
      const qAr = svc.nextQuestion(topic, step, 'ar');
      expect(qEn.prompt.length).toBeGreaterThan(5);
      expect(qAr.prompt).toMatch(/[\u0600-\u06FF]/);
      expect(qEn.input_type).toMatch(/number|choice/);
      if (qEn.input_type === 'choice') {
        expect(qEn.options.length).toBeGreaterThanOrEqual(2);
        expect(qAr.options[0].label).toMatch(/[\u0600-\u06FF]/);
      }
    }
  });
});

describe('mapAnswerToEntities golden matrix', () => {
  const cases = [
    { topic: 'sleep_spending', step: 0, answer: 6.5, want: { domain: 'health', type: 'sleep', value: 6.5 } },
    { topic: 'sleep_spending', step: 1, answer: 42.5, want: { domain: 'finance', type: 'expense', amount: 42.5 } },
    { topic: 'mood_nutrition', step: 0, answer: 7, want: { domain: 'health', type: 'mood', value: 7 } },
    { topic: 'mood_nutrition', step: 1, answer: 2, want: { domain: 'health', type: 'water', value: 2 } },
    { topic: 'mood_nutrition', step: 2, answer: 'junk', want: { domain: 'health', type: 'nutrition', value: 1, value_text: 'junk' } },
    { topic: 'activity_mood', step: 0, answer: 45, want: { domain: 'health', type: 'exercise', value: 45, duration: 45 } },
    { topic: 'activity_mood', step: 1, answer: 8, want: { domain: 'health', type: 'mood', value: 8 } },
    { topic: 'budget_savings', step: 0, answer: 1000, want: { domain: 'finance', type: 'income', amount: 1000 } },
    { topic: 'budget_savings', step: 1, answer: 750.129, want: { domain: 'finance', type: 'expense', amount: 750.13 } },
  ];

  test.each(cases.map((c) => [`${c.topic}#${c.step}`, c]))('%s maps correctly', (_id, c) => {
    expect(svc.mapAnswerToEntities(c.topic, c.step, c.answer)).toMatchObject(c.want);
  });

  test('rejects out-of-range and invalid answers', () => {
    expect(svc.mapAnswerToEntities('sleep_spending', 0, 30)).toBeNull(); // > 24h
    expect(svc.mapAnswerToEntities('sleep_spending', 0, -1)).toBeNull();
    expect(svc.mapAnswerToEntities('sleep_spending', 0, 'nope')).toBeNull();
    expect(svc.mapAnswerToEntities('mood_nutrition', 2, 'unknown')).toBeNull();
    expect(svc.mapAnswerToEntities('bad', 0, 1)).toBeNull();
    // Finance rows require amount >= 0.01 (FinancialLog validation) — zero must
    // not reach create() or the interview freezes on a 500.
    expect(svc.mapAnswerToEntities('sleep_spending', 1, 0)).toBeNull();
    expect(svc.mapAnswerToEntities('budget_savings', 0, 0)).toBeNull();
    expect(svc.mapAnswerToEntities('budget_savings', 1, 0.009)).toBeNull();
  });
});

describe('full XD interview flow (sleep_spending)', () => {
  test('log both answers → LinkedDomain + bilingual advice payload', async () => {
    const sleep = await svc.logAnswerEntities(1, 'sleep_spending', 0, 5);
    const spend = await svc.logAnswerEntities(1, 'sleep_spending', 1, 55);
    expect(sleep).toMatchObject({ domain: 'health', type: 'sleep', value: 5 });
    expect(spend).toMatchObject({ domain: 'finance', type: 'expense', amount: 55 });

    const fin = await svc.finalizeInterview(1, 'sleep_spending', {
      healthIds: [sleep.id],
      financeIds: [spend.id],
      sourceMessage: 'Voice interview: sleep_spending',
    }, 'ar');

    expect(fin.links.length).toBe(1);
    expect(await LinkedDomain.count()).toBe(1);
    const link = await LinkedDomain.findByPk(fin.links[0]);
    expect(link).toMatchObject({
      health_log_id: sleep.id,
      financial_log_id: spend.id,
      link_type: 'manual',
    });
    expect(fin.advice.topic).toBe('sleep_spending');
    expect(fin.advice.title).toMatch(/[\u0600-\u06FF]/);
    expect(fin.advice.advice.length).toBeGreaterThanOrEqual(1);
    expect(fin.advice.advice[0].text.length).toBeGreaterThan(5);
    // Logs actually land for the dashboard
    expect(await HealthLog.count()).toBe(1);
    expect(await FinancialLog.count()).toBe(1);
  });

  test('non-XD topics never create LinkedDomain rows', async () => {
    const m = await svc.logAnswerEntities(1, 'activity_mood', 0, 20);
    const mood = await svc.logAnswerEntities(1, 'activity_mood', 1, 6);
    const fin = await svc.finalizeInterview(1, 'activity_mood', {
      healthIds: [m.id, mood.id],
      financeIds: [],
    }, 'en');
    expect(fin.links.length).toBe(0);
    expect(await LinkedDomain.count()).toBe(0);
  });
});

// Every topic, every step, real DB writes — catches "freezes after question N"
// when a later step's entity fails create (e.g. finance amount 0).
describe('heavy: every interview topic completes end-to-end', () => {
  const scripts = [
    {
      topic: 'sleep_spending',
      answers: [6.5, 42],
      expectXd: true,
    },
    {
      topic: 'mood_nutrition',
      answers: [7, 1.5, 'mixed'],
      expectXd: false,
    },
    {
      topic: 'activity_mood',
      answers: [25, 8],
      expectXd: false,
    },
    {
      topic: 'budget_savings',
      answers: [1200, 380],
      expectXd: false,
    },
  ];

  test.each(scripts.map((s) => [s.topic, s]))('%s walks every step without stalling', async (_id, script) => {
    const healthIds = [];
    const financeIds = [];
    const total = svc.totalSteps(script.topic);
    expect(total).toBe(script.answers.length);

    for (let step = 0; step < total; step += 1) {
      const q = svc.nextQuestion(script.topic, step, 'en');
      expect(q).not.toBeNull();
      expect(q.step).toBe(step);
      expect(q.total).toBe(total);
      expect(q.prompt.length).toBeGreaterThan(3);

      const logged = await svc.logAnswerEntities(1, script.topic, step, script.answers[step]);
      expect(logged).not.toBeNull(); // null here = UI would freeze on same question
      if (logged.domain === 'health') healthIds.push(logged.id);
      else financeIds.push(logged.id);

      const next = svc.nextQuestion(script.topic, step + 1, 'en');
      if (step < total - 1) expect(next).not.toBeNull();
      else expect(next).toBeNull();
    }

    const fin = await svc.finalizeInterview(1, script.topic, {
      healthIds,
      financeIds,
      sourceMessage: `heavy:${script.topic}`,
    }, 'en');
    expect(fin.advice).toBeTruthy();
    expect(Array.isArray(fin.advice.advice)).toBe(true);
    if (script.expectXd) {
      expect(fin.links.length).toBeGreaterThanOrEqual(1);
    } else {
      expect(fin.links.length).toBe(0);
    }
  });

  test('Arabic prompts for every step of every topic', () => {
    for (const topic of ['sleep_spending', 'mood_nutrition', 'activity_mood', 'budget_savings']) {
      for (let step = 0; step < svc.totalSteps(topic); step += 1) {
        const q = svc.nextQuestion(topic, step, 'ar');
        expect(q.prompt).toMatch(/[\u0600-\u06FF]/);
        if (q.input_type === 'choice') {
          expect(q.options.length).toBeGreaterThan(0);
          for (const o of q.options) expect(o.label).toMatch(/[\u0600-\u06FF]/);
        }
      }
    }
  });
});

describe('cloud voice pure contracts', () => {
  test('contentTypeFromFormat covers production formats', () => {
    expect(voiceRoutes.contentTypeFromFormat('wav')).toBe('audio/wav');
    expect(voiceRoutes.contentTypeFromFormat('mp3')).toBe('audio/mpeg');
    expect(voiceRoutes.contentTypeFromFormat('opus')).toBe('audio/opus');
  });

  test('default tts format is wav (Groq Orpheus-safe)', () => {
    delete process.env.VOICE_TTS_FORMAT;
    expect(voiceRoutes.ttsFormat()).toBe('wav');
  });
});

// Voice→chat language contract: Arabic STT must not be treated as English
// just because Whisper omitted language=ar in the past (root-cause harness).
describe('voice language harness (STT → turnLang)', () => {
  const { _detectLang: detectLang } = require('../server/services/ai/nlpService');
  const { _buildMessages, _buildLanguageDirective } = require('../server/services/ai/conversationService');

  test('Arabic transcript locks AR reply; English transcript locks EN', () => {
    expect(detectLang('نمت قليل الليلة')).toBe('ar');
    expect(detectLang('I slept poorly')).toBe('en');
    expect(_buildLanguageDirective('ar')).toMatch(/Do NOT reply in English/);
    expect(_buildLanguageDirective('en')).toMatch(/Do NOT reply in Arabic/);
  });

  test('user message for AR generation carries an Arabic-only prefix', () => {
    const msgs = _buildMessages([], 'صرفت ٥٠ على عشاء', 'ar');
    expect(msgs[0].content.startsWith('أجب بالعربية فقط')).toBe(true);
  });

  test('cross-domain curiosity is in the system prompt', () => {
    const { _buildSystemPrompt } = require('../server/services/ai/conversationService');
    const sys = _buildSystemPrompt({}, [], 'ar', 'test-model');
    expect(sys).toMatch(/CROSS-DOMAIN CURIOSITY/);
    expect(sys).toMatch(/curious question/i);
  });
});
