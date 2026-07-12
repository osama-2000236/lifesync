// Integration-ish service tests for weekly reports (UC-13) with SQLite.

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-32-characters!!';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-32-chars!!';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-for-jest-32ch';

const { sequelize, User, WeeklyReport } = require('../server/models');
const {
  generateWeeklyReport,
  listReports,
  getReportForUser,
  downloadReportPdf,
  isoWeekKey,
} = require('../server/services/reportService');

jest.mock('../server/services/ai/dashboardInsightsService', () => ({
  persistDashboardInsights: jest.fn(),
}));

const { persistDashboardInsights } = require('../server/services/ai/dashboardInsightsService');

const defaultInsights = (userId) => ({
  id: 99,
  period: {
    start: new Date('2026-07-06T00:00:00Z'),
    end: new Date('2026-07-12T00:00:00Z'),
  },
  summary: `Deterministic summary for user ${userId}`,
  health_score: 70,
  financial_health_score: 60,
  mood_trend: 'up',
  spending_trend: 'stable',
  budget_summary: { total_expense: 40 },
  cross_domain_insights: 'Walks linked to lower spend',
  recommendations: [{ text: 'Sleep 7h+', priority: 'high' }],
  patterns: [{ text: 'pattern-a' }],
  model_runtime: { status: 'classifier_only' },
});

describe('reportService (UC-13)', () => {
  let user;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  beforeEach(async () => {
    await WeeklyReport.destroy({ where: {} });
    await User.destroy({ where: {} });
    persistDashboardInsights.mockReset();
    persistDashboardInsights.mockImplementation(async (userId) => defaultInsights(userId));
    user = await User.create({
      username: 'report_user',
      email: 'report@test.com',
      hashed_password: 'Password1!',
      verified_email: true,
      is_active: true,
      name: 'Report User',
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('generateWeeklyReport creates a frozen snapshot', async () => {
    const at = new Date('2026-07-11T12:00:00Z');
    const { report, created } = await generateWeeklyReport(user.id, { at });
    expect(created).toBe(true);
    expect(report.user_id).toBe(user.id);
    expect(report.week_key).toBe(isoWeekKey(at));
    // period_* must match ISO Mon–Sun for week_key (not rolling insights.period)
    expect(report.period_start).toBe('2026-07-06');
    expect(report.period_end).toBe('2026-07-12');
    expect(report.summary).toMatch(/Deterministic summary/);
    expect(report.metrics_snapshot.health_score).toBe(70);
  });

  test('generateWeeklyReport is idempotent for the same week', async () => {
    const at = new Date('2026-07-11T12:00:00Z');
    const first = await generateWeeklyReport(user.id, { at });
    const second = await generateWeeklyReport(user.id, { at });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.report.id).toBe(first.report.id);
    const all = await listReports(user.id);
    expect(all).toHaveLength(1);
  });

  test('getReportForUser enforces ownership (IDOR)', async () => {
    const { report } = await generateWeeklyReport(user.id, {
      at: new Date('2026-07-11T12:00:00Z'),
    });
    const other = await User.create({
      username: 'other_u',
      email: 'other@test.com',
      hashed_password: 'Password1!',
      verified_email: true,
      is_active: true,
    });
    const own = await getReportForUser(report.id, user.id);
    const foreign = await getReportForUser(report.id, other.id);
    expect(own.id).toBe(report.id);
    expect(foreign).toBeNull();
  });

  test('downloadReportPdf returns PDF bytes for owner only', async () => {
    const { report } = await generateWeeklyReport(user.id, {
      at: new Date('2026-07-11T12:00:00Z'),
    });
    const pdf = await downloadReportPdf(report.id, user.id);
    expect(pdf.buffer.slice(0, 5).toString()).toBe('%PDF-');
    expect(pdf.filename).toMatch(/\.pdf$/);
    const denied = await downloadReportPdf(report.id, 99999);
    expect(denied).toBeNull();
  });

  test('generateWeeklyReport freezes only valid values (strips NaN/empty junk)', async () => {
    persistDashboardInsights.mockImplementationOnce(async () => ({
      id: 7,
      summary: '',
      health_score: Number.NaN,
      financial_health_score: 200,
      mood_trend: null,
      spending_trend: 'stable',
      budget_summary: { income: Number.NaN, expenses: 33.3, top_categories: [{ category: 'Food', percentage: 50 }] },
      cross_domain_insights: '',
      recommendations: [{ text: '' }, { text: 'Drink water', priority: 'MEDIUM' }],
      patterns: [{ observation: '' }, { observation: 'Hydration up' }],
      model_runtime: { status: 'ready', api_key: 'secret' },
    }));
    const { report, created } = await generateWeeklyReport(user.id, {
      at: new Date('2026-07-11T12:00:00Z'),
    });
    expect(created).toBe(true);
    expect(report.summary).toBe('Weekly summary.');
    expect(report.metrics_snapshot.health_score).toBeNull();
    expect(report.metrics_snapshot.financial_health_score).toBe(100);
    expect(report.metrics_snapshot.mood_trend).toBeNull();
    expect(report.metrics_snapshot.spending_trend).toBe('stable');
    expect(report.metrics_snapshot.budget).toEqual({
      expenses: 33.3,
      top_categories: [{ category: 'Food', percentage: 50 }],
    });
    expect(report.metrics_snapshot.cross_domain).toBeNull();
    expect(report.metrics_snapshot.model_runtime).toEqual({ status: 'ready' });
    expect(report.metrics_snapshot.model_runtime.api_key).toBeUndefined();
    expect(report.recommendations).toEqual([{ text: 'Drink water', priority: 'medium' }]);
    expect(report.patterns).toEqual([{ observation: 'Hydration up' }]);
  });
});
