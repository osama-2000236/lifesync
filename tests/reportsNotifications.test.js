// tests/reportsNotifications.test.js
// ============================================
// Reports (UR12) + Notifications (UR9) endpoint tests
// ============================================

jest.mock('../server/config/firebase', () => ({
  initializeFirebase: jest.fn(),
  getFirestore: jest.fn(() => null),
}));

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

jest.mock('../server/middleware/auth', () => ({
  authenticate: (req, res, next) => {
    if (!req.headers.authorization?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No token' });
    }
    req.user = { id: 1 };
    next();
  },
  optionalAuth: (req, _res, next) => next(),
}));

// Keep report generation offline + deterministic.
jest.mock('../server/services/ai/insightsService', () => ({
  getCurrentInsights: jest.fn(async () => ({
    summary: 'Steady week overall.',
    headline: 'A steady week.',
    health_score: 72,
    financial_health_score: 65,
    mood_sentiment: 'neutral',
    spending_behavior: 'balanced',
    model_used: 'BERT (fine-tuned)',
    recommendations: [{ text: 'Drink more water.', priority: 'medium', domain: 'health', reason: 'hydration' }],
  })),
}));

const request = require('supertest');
const { app } = require('../server/app');
const db = require('../server/models');

const { sequelize, User, HealthLog, FinancialLog, Notification, Report } = db;
const AUTH = { Authorization: 'Bearer test-token' };

beforeAll(async () => {
  await sequelize.sync({ force: true });
  await User.create({
    id: 1, username: 'reituser', email: 'rep@example.com',
    hashed_password: 'x', verified_email: true, is_active: true,
  });
  await HealthLog.create({ user_id: 1, type: 'sleep', value: 7, unit: 'hours', logged_at: new Date(), source: 'manual' });
  await FinancialLog.create({ user_id: 1, type: 'expense', amount: 30, currency: 'USD', description: 'food', logged_at: new Date(), source: 'manual' });
});

afterAll(async () => {
  await sequelize.close();
});

describe('Reports — UR12', () => {
  let reportId;

  test('POST /api/reports/generate creates a report', async () => {
    const res = await request(app).post('/api/reports/generate').set(AUTH);
    expect(res.status).toBe(201);
    expect(res.body.data.report.id).toBeTruthy();
    expect(res.body.data.report.content.scores.health).toBe(72);
    reportId = res.body.data.report.id;
  });

  test('GET /api/reports lists reports', async () => {
    const res = await request(app).get('/api/reports').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/reports/:id returns full content', async () => {
    const res = await request(app).get(`/api/reports/${reportId}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.report.content.finance.expense_total).toBe(30);
  });

  test('download as CSV', async () => {
    const res = await request(app).get(`/api/reports/${reportId}/download?format=csv`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('.csv');
    expect(res.text).toContain('LifeSync Weekly Report');
  });

  test('download as HTML', async () => {
    const res = await request(app).get(`/api/reports/${reportId}/download?format=html`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<table');
  });

  test('download as JSON (default)', async () => {
    const res = await request(app).get(`/api/reports/${reportId}/download`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
  });

  test('404 for unknown report', async () => {
    const res = await request(app).get('/api/reports/99999').set(AUTH);
    expect(res.status).toBe(404);
  });

  test('401 without auth', async () => {
    const res = await request(app).get('/api/reports');
    expect(res.status).toBe(401);
  });
});

describe('Notifications — UR9', () => {
  test('report generation emitted a report notification', async () => {
    const res = await request(app).get('/api/notifications').set(AUTH);
    expect(res.status).toBe(200);
    const reportNotif = res.body.data.find((n) => n.type === 'report');
    expect(reportNotif).toBeTruthy();
    expect(res.body.pagination.unread).toBeGreaterThanOrEqual(1);
  });

  test('unread-count endpoint', async () => {
    const res = await request(app).get('/api/notifications/unread-count').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBeGreaterThanOrEqual(1);
  });

  test('mark one as read decreases unread', async () => {
    const before = await Notification.count({ where: { user_id: 1, is_read: false } });
    const first = await Notification.findOne({ where: { user_id: 1, is_read: false } });
    const res = await request(app).put(`/api/notifications/${first.id}/read`).set(AUTH);
    expect(res.status).toBe(200);
    const after = await Notification.count({ where: { user_id: 1, is_read: false } });
    expect(after).toBe(before - 1);
  });

  test('mark all read', async () => {
    await Notification.create({ user_id: 1, type: 'system', title: 't', message: 'm' });
    const res = await request(app).put('/api/notifications/read-all').set(AUTH);
    expect(res.status).toBe(200);
    const unread = await Notification.count({ where: { user_id: 1, is_read: false } });
    expect(unread).toBe(0);
  });

  test('delete a notification', async () => {
    const n = await Notification.create({ user_id: 1, type: 'system', title: 'del', message: 'm' });
    const res = await request(app).delete(`/api/notifications/${n.id}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(await Notification.findByPk(n.id)).toBeNull();
  });

  test('404 deleting unknown notification', async () => {
    const res = await request(app).delete('/api/notifications/99999').set(AUTH);
    expect(res.status).toBe(404);
  });
});
