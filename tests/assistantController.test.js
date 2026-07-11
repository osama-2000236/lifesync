// tests/assistantController.test.js
// ============================================
// Voice Assistant Controller — full branch coverage.
// The service is mocked so we can exercise every controller path deterministically.
// ============================================

jest.mock('../server/services/ai/crossDomainInterviewService', () => ({
  pickTopic: jest.fn(),
  isValidTopic: jest.fn(),
  isCrossDomain: jest.fn(),
  totalSteps: jest.fn(),
  nextQuestion: jest.fn(),
  gatherTodayCoverage: jest.fn(async () => ({ health: new Set(), finance: new Set() })),
  firstOpenStep: jest.fn(() => 0),
  stepCoveredToday: jest.fn(() => false),
  totalSteps: jest.fn(() => 2),
  recordDismissal: jest.fn(),
  logAnswerEntities: jest.fn(),
  finalizeInterview: jest.fn(),
}));

const svc = require('../server/services/ai/crossDomainInterviewService');
const ctrl = require('../server/controllers/assistantController');

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  ctrl._activeInterviews.clear();
});

describe('getSuggestion', () => {
  test('returns suggestion (default lang)', async () => {
    svc.pickTopic.mockResolvedValue({ topic: 'sleep_spending' });
    const res = makeRes();
    await ctrl.getSuggestion({ user: { id: 1 }, query: {} }, res, jest.fn());
    expect(svc.pickTopic).toHaveBeenCalledWith(1, 'en');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('honors ar lang query', async () => {
    svc.pickTopic.mockResolvedValue({ topic: null });
    const res = makeRes();
    await ctrl.getSuggestion({ user: { id: 2 }, query: { lang: 'ar' } }, res, jest.fn());
    expect(svc.pickTopic).toHaveBeenCalledWith(2, 'ar');
  });

  test('forwards errors to next', async () => {
    svc.pickTopic.mockRejectedValue(new Error('boom'));
    const next = jest.fn();
    await ctrl.getSuggestion({ user: { id: 1 }, query: {} }, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('startInterview', () => {
  test('rejects unknown topic', async () => {
    svc.isValidTopic.mockReturnValue(false);
    const res = makeRes();
    await ctrl.startInterview({ user: { id: 1 }, body: { topic: 'x', consent: true } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('consent=false records dismissal', async () => {
    svc.isValidTopic.mockReturnValue(true);
    svc.recordDismissal.mockResolvedValue({});
    ctrl._activeInterviews.set(1, { topic: 'sleep_spending', step: 0 });
    const res = makeRes();
    await ctrl.startInterview({ user: { id: 1 }, body: { topic: 'sleep_spending', consent: false } }, res, jest.fn());
    expect(svc.recordDismissal).toHaveBeenCalledWith(1, 'sleep_spending');
    expect(ctrl._activeInterviews.has(1)).toBe(false);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ dismissed: true }) }));
  });

  test('consent=true returns first question + sets state (ar lang)', async () => {
    svc.isValidTopic.mockReturnValue(true);
    svc.isCrossDomain.mockReturnValue(true);
    svc.totalSteps.mockReturnValue(2);
    svc.gatherTodayCoverage.mockResolvedValue({ health: new Set(), finance: new Set() });
    svc.firstOpenStep.mockReturnValue(0);
    svc.nextQuestion.mockReturnValue({ id: 'sleep_hours', step: 0 });
    const res = makeRes();
    await ctrl.startInterview({ user: { id: 7 }, body: { topic: 'sleep_spending', consent: true, lang: 'ar' } }, res, jest.fn());
    expect(svc.nextQuestion).toHaveBeenCalledWith('sleep_spending', 0, 'ar');
    expect(ctrl._activeInterviews.get(7)).toMatchObject({ topic: 'sleep_spending', step: 0 });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('consent=true skips interview when all steps already logged today', async () => {
    svc.isValidTopic.mockReturnValue(true);
    svc.firstOpenStep.mockReturnValue(null);
    const res = makeRes();
    await ctrl.startInterview({ user: { id: 3 }, body: { topic: 'mood_nutrition', consent: true } }, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ skipped: true, done: true }),
    }));
    expect(ctrl._activeInterviews.has(3)).toBe(false);
  });

  test('forwards errors to next', async () => {
    svc.isValidTopic.mockReturnValue(true);
    svc.recordDismissal.mockRejectedValue(new Error('db down'));
    const next = jest.fn();
    await ctrl.startInterview({ user: { id: 1 }, body: { topic: 'sleep_spending', consent: false } }, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('answerInterview', () => {
  test('409 when no active interview', async () => {
    const res = makeRes();
    await ctrl.answerInterview({ user: { id: 1 }, body: { step: 0, answer: 5 } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('409 on step mismatch', async () => {
    ctrl._activeInterviews.set(1, { topic: 'sleep_spending', step: 1, healthIds: [], financeIds: [] });
    const res = makeRes();
    await ctrl.answerInterview({ user: { id: 1 }, body: { step: 0, answer: 5 } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('422 on invalid answer', async () => {
    ctrl._activeInterviews.set(1, { topic: 'sleep_spending', step: 0, healthIds: [], financeIds: [] });
    svc.logAnswerEntities.mockResolvedValue(null);
    const res = makeRes();
    await ctrl.answerInterview({ user: { id: 1 }, body: { step: 0, answer: 999 } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(422);
  });

  test('returns next question when more remain (health id tracked)', async () => {
    ctrl._activeInterviews.set(1, { topic: 'sleep_spending', step: 0, healthIds: [], financeIds: [] });
    svc.logAnswerEntities.mockResolvedValue({ domain: 'health', id: 11 });
    svc.nextQuestion.mockReturnValue({ id: 'impulse_spend', step: 1 });
    const res = makeRes();
    await ctrl.answerInterview({ user: { id: 1 }, body: { step: 0, answer: 8 } }, res, jest.fn());
    const state = ctrl._activeInterviews.get(1);
    expect(state.healthIds).toEqual([11]);
    expect(state.step).toBe(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ done: false }) }));
  });

  test('finalizes on last answer (finance id tracked, advice returned)', async () => {
    ctrl._activeInterviews.set(3, { topic: 'sleep_spending', step: 1, healthIds: [11], financeIds: [], createdAt: Date.now() });
    svc.logAnswerEntities.mockResolvedValue({ domain: 'finance', id: 22 });
    svc.nextQuestion.mockReturnValue(null); // no more questions
    svc.finalizeInterview.mockResolvedValue({ links: [99], advice: { topic: 'sleep_spending' } });
    const res = makeRes();
    await ctrl.answerInterview({ user: { id: 3 }, body: { step: 1, answer: 40, lang: 'ar' } }, res, jest.fn());
    expect(svc.finalizeInterview).toHaveBeenCalledWith(3, 'sleep_spending',
      expect.objectContaining({ healthIds: [11], financeIds: [22] }), 'ar');
    expect(ctrl._activeInterviews.has(3)).toBe(false);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ done: true, links: [99] }) }));
  });

  test('forwards errors to next', async () => {
    ctrl._activeInterviews.set(1, { topic: 'sleep_spending', step: 0, healthIds: [], financeIds: [] });
    svc.logAnswerEntities.mockRejectedValue(new Error('db'));
    const next = jest.fn();
    await ctrl.answerInterview({ user: { id: 1 }, body: { step: 0, answer: 8 } }, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  test('honest zero answer advances without tracking a row id (no 422)', async () => {
    ctrl._activeInterviews.set(4, { topic: 'sleep_spending', step: 1, healthIds: [11], financeIds: [], createdAt: Date.now() });
    svc.logAnswerEntities.mockResolvedValue({ domain: 'finance', skipped: true });
    svc.nextQuestion.mockReturnValue(null);
    svc.finalizeInterview.mockResolvedValue({ links: [], advice: { topic: 'sleep_spending' } });
    const res = makeRes();
    await ctrl.answerInterview({ user: { id: 4 }, body: { step: 1, answer: 0 } }, res, jest.fn());
    // Nothing logged for the zero answer — no fake finance id, no fake link.
    expect(svc.finalizeInterview).toHaveBeenCalledWith(4, 'sleep_spending',
      expect.objectContaining({ healthIds: [11], financeIds: [] }), 'en');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ done: true }) }));
  });
});

describe('validation chains', () => {
  test('are exported as arrays', () => {
    expect(Array.isArray(ctrl.startValidation)).toBe(true);
    expect(Array.isArray(ctrl.answerValidation)).toBe(true);
  });
});
