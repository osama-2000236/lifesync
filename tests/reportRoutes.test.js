// Integration tests — /api/reports (UC-13 / UC-14) via supertest

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-32-characters!!';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-32-chars!!';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-for-jest-32ch';
process.env.DISABLE_RATE_LIMITS = '1';

const request = require('supertest');
const { sequelize, User } = require('../server/models');
const { generateTokenPair } = require('../server/utils/tokenUtils');
const { app } = require('../server/app');

jest.mock('../server/services/ai/dashboardInsightsService', () => ({
  persistDashboardInsights: jest.fn(async () => ({
    id: 1,
    period: { start: new Date('2026-07-06'), end: new Date('2026-07-12') },
    summary: 'Route-level summary',
    health_score: 80,
    financial_health_score: 70,
    mood_trend: 'stable',
    spending_trend: 'down',
    budget_summary: {},
    cross_domain_insights: null,
    recommendations: [],
    patterns: [],
    model_runtime: { status: 'classifier_only' },
  })),
  buildDashboardInsights: jest.fn(),
}));

// Avoid scheduler side effects if app loads it
jest.mock('../server/services/reportScheduler', () => {
  const actual = jest.requireActual('../server/services/reportScheduler');
  return {
    ...actual,
    startReportScheduler: jest.fn(),
  };
});

describe('report routes (integration)', () => {
  let user;
  let token;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  beforeEach(async () => {
    await sequelize.sync({ force: true });
    user = await User.create({
      username: 'route_rep',
      email: 'routerep@test.com',
      hashed_password: 'Password1!',
      verified_email: true,
      is_active: true,
      name: 'Route User',
      report_notify_enabled: true,
    });
    token = generateTokenPair(user).accessToken;
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('SR: unauthenticated access is rejected', async () => {
    await request(app).get('/api/reports').expect(401);
    await request(app).post('/api/reports/generate').expect(401);
  });

  test('UC-13: generate + list + download PDF', async () => {
    const gen = await request(app)
      .post('/api/reports/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ notify: true })
      .expect(201);

    expect(gen.body.success).toBe(true);
    const reportId = gen.body.data.report.id;
    expect(reportId).toBeTruthy();
    expect(gen.body.data.notification).toBeTruthy();

    const list = await request(app)
      .get('/api/reports')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.data.reports.length).toBe(1);

    const pdf = await request(app)
      .get(`/api/reports/${reportId}/download`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(pdf.headers['content-type']).toMatch(/pdf/);
    expect(pdf.body.slice(0, 4).toString()).toBe('%PDF');

    // Idempotent generate (no force)
    const again = await request(app)
      .post('/api/reports/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ notify: false })
      .expect(200);
    expect(again.body.data.created).toBe(false);
    expect(again.body.data.refreshed).toBe(false);

    // Force refresh rebuilds snapshot for the same week
    const refreshed = await request(app)
      .post('/api/reports/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ notify: false, force: true })
      .expect(200);
    expect(refreshed.body.data.created).toBe(false);
    expect(refreshed.body.data.refreshed).toBe(true);
    expect(refreshed.body.data.report.id).toBe(reportId);
    expect(refreshed.body.data.report.metrics_snapshot.daily_overview.days).toHaveLength(7);
  });

  test('UC-13: foreign report download is 404 (not leak)', async () => {
    const gen = await request(app)
      .post('/api/reports/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ notify: false })
      .expect(201);
    const reportId = gen.body.data.report.id;

    const other = await User.create({
      username: 'other_r',
      email: 'otherr@test.com',
      hashed_password: 'Password1!',
      verified_email: true,
      is_active: true,
    });
    const otherTok = generateTokenPair(other).accessToken;

    await request(app)
      .get(`/api/reports/${reportId}/download`)
      .set('Authorization', `Bearer ${otherTok}`)
      .expect(404);
  });

  test('UC-14: notifications list + mark read + prefs', async () => {
    await request(app)
      .post('/api/reports/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ notify: true })
      .expect(201);

    const notes = await request(app)
      .get('/api/reports/notifications')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(notes.body.data.unread_count).toBeGreaterThanOrEqual(1);
    const nid = notes.body.data.notifications[0].id;

    await request(app)
      .put(`/api/reports/notifications/${nid}/read`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app)
      .put('/api/reports/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ report_notify_enabled: false })
      .expect(200);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    // profile may nest user
    const u = me.body.data?.user || me.body.data;
    if (u && 'report_notify_enabled' in u) {
      expect(u.report_notify_enabled).toBe(false);
    }
  });

  test('SR: cron route dormant without secret', async () => {
    delete process.env.REPORT_CRON_SECRET;
    await request(app).post('/api/reports/cron/weekly').expect(404);
  });

  test('SR: cron route rejects wrong secret', async () => {
    process.env.REPORT_CRON_SECRET = 'cron-test-secret';
    await request(app)
      .post('/api/reports/cron/weekly')
      .set('X-Report-Cron-Secret', 'wrong')
      .expect(401);
    delete process.env.REPORT_CRON_SECRET;
  });

  test('SR: cron success returns operational summary only (no report bodies)', async () => {
    process.env.REPORT_CRON_SECRET = 'cron-test-secret-ok';
    const res = await request(app)
      .post('/api/reports/cron/weekly')
      .set('X-Report-Cron-Secret', 'cron-test-secret-ok')
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      week_key: expect.any(String),
      processed: expect.any(Number),
      ok: expect.any(Number),
      failed: expect.any(Number),
    });
    const blob = JSON.stringify(res.body.data);
    expect(blob).not.toMatch(/@test\.com|metrics_snapshot|notification\.body|summary/i);
    if (Array.isArray(res.body.data.results)) {
      for (const r of res.body.data.results) {
        expect(r).toHaveProperty('user_id');
        expect(r).toHaveProperty('ok');
        expect(r.report).toBeUndefined();
        expect(r.notification).toBeUndefined();
      }
    }
    delete process.env.REPORT_CRON_SECRET;
  });

  test('UC-14: cannot mark another users notification read', async () => {
    await request(app)
      .post('/api/reports/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ notify: true })
      .expect(201);
    const notes = await request(app)
      .get('/api/reports/notifications')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const nid = notes.body.data.notifications[0].id;

    const other = await User.create({
      username: 'other_n',
      email: 'othern@test.com',
      hashed_password: 'Password1!',
      verified_email: true,
      is_active: true,
    });
    const otherTok = generateTokenPair(other).accessToken;
    await request(app)
      .put(`/api/reports/notifications/${nid}/read`)
      .set('Authorization', `Bearer ${otherTok}`)
      .expect(404);
  });
});
