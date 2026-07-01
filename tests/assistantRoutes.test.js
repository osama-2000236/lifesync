// tests/assistantRoutes.test.js
// ============================================
// Assistant route wiring + validation (auth + service mocked → no DB).
// ============================================

jest.mock('../server/middleware/auth', () => ({
  authenticate: (req, _res, next) => { req.user = { id: 1 }; next(); },
}));

jest.mock('../server/services/ai/crossDomainInterviewService', () => ({
  pickTopic: jest.fn().mockResolvedValue({ topic: null }),
  isValidTopic: jest.fn().mockReturnValue(true),
  isCrossDomain: jest.fn().mockReturnValue(true),
  totalSteps: jest.fn().mockReturnValue(2),
  nextQuestion: jest.fn().mockReturnValue({ id: 'q', step: 0 }),
  recordDismissal: jest.fn().mockResolvedValue({}),
  logAnswerEntities: jest.fn().mockResolvedValue({ domain: 'health', id: 1 }),
  finalizeInterview: jest.fn().mockResolvedValue({ links: [], advice: {} }),
}));

const express = require('express');
const request = require('supertest');
const assistantRoutes = require('../server/routes/assistantRoutes');
const ctrl = require('../server/controllers/assistantController');

const app = express();
app.use(express.json());
app.use('/api/assistant', assistantRoutes);

afterAll(() => { clearInterval(ctrl._sweepInterval); });
beforeEach(() => { ctrl._activeInterviews.clear(); });

test('GET /suggestion is wired', async () => {
  const res = await request(app).get('/api/assistant/suggestion');
  expect(res.status).toBe(200);
});

test('POST /interview/start validates body', async () => {
  const res = await request(app).post('/api/assistant/interview/start').send({});
  expect(res.status).toBe(400);
});

test('POST /interview/start accepts valid body', async () => {
  const res = await request(app)
    .post('/api/assistant/interview/start')
    .send({ topic: 'sleep_spending', consent: true });
  expect(res.status).toBe(200);
});

test('POST /interview/answer validates body', async () => {
  const res = await request(app).post('/api/assistant/interview/answer').send({});
  expect(res.status).toBe(400);
});

test('POST /interview/answer is wired (409 without active interview)', async () => {
  const res = await request(app)
    .post('/api/assistant/interview/answer')
    .send({ step: 0, answer: 5 });
  expect(res.status).toBe(409);
});
