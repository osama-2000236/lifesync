// UC-14 notification service tests

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-32-characters!!';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-32-chars!!';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-for-jest-32ch';

const { sequelize, User, UserNotification, WeeklyReport } = require('../server/models');
const {
  notifyWeeklyReportReady,
  listNotifications,
  markRead,
  markAllRead,
  unreadCount,
} = require('../server/services/notificationService');

jest.mock('../server/services/notificationService', () => {
  // partial mock only for email — re-require real after unmock is hard.
  // Instead mock send at module level below by not using network:
  return jest.requireActual('../server/services/notificationService');
});

// Force no email providers in test.
delete process.env.RESEND_API_KEY;
delete process.env.BREVO_API_KEY;
delete process.env.SENDGRID_API_KEY;
delete process.env.SMTP_HOST;

describe('notificationService (UC-14)', () => {
  let user;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  beforeEach(async () => {
    await UserNotification.destroy({ where: {} });
    await WeeklyReport.destroy({ where: {} });
    await User.destroy({ where: {} });
    user = await User.create({
      username: 'notify_user',
      email: 'notify@test.com',
      hashed_password: 'Password1!',
      verified_email: true,
      is_active: true,
      report_notify_enabled: true,
      name: 'Notify User',
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('refuses to notify without a persisted report id', async () => {
    await expect(notifyWeeklyReportReady(user.id, { week_key: '2026-W28' }))
      .rejects.toThrow(/persisted report/);
  });

  test('creates in-app notification once per report', async () => {
    const report = { id: 42, week_key: '2026-W28', metrics_snapshot: { health_score: 70, financial_health_score: 55 } };
    const first = await notifyWeeklyReportReady(user.id, report);
    expect(first.created).toBe(true);
    expect(first.notification.title).toMatch(/weekly/i);
    expect(first.notification.meta.report_id).toBe(42);

    const second = await notifyWeeklyReportReady(user.id, report);
    expect(second.created).toBe(false);
    expect(second.notification.id).toBe(first.notification.id);

    const list = await listNotifications(user.id);
    expect(list).toHaveLength(1);
    expect(await unreadCount(user.id)).toBe(1);
  });

  test('respects report_notify_enabled=false (opt-out)', async () => {
    await user.update({ report_notify_enabled: false });
    const result = await notifyWeeklyReportReady(user.id, {
      id: 7,
      week_key: '2026-W28',
      metrics_snapshot: {},
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('opted_out');
    expect(await listNotifications(user.id)).toHaveLength(0);
  });

  test('markRead and markAllRead clear unread', async () => {
    const a = await notifyWeeklyReportReady(user.id, { id: 1, week_key: '2026-W27', metrics_snapshot: {} });
    await notifyWeeklyReportReady(user.id, { id: 2, week_key: '2026-W28', metrics_snapshot: {} });
    expect(await unreadCount(user.id)).toBe(2);
    await markRead(a.notification.id, user.id);
    expect(await unreadCount(user.id)).toBe(1);
    await markAllRead(user.id);
    expect(await unreadCount(user.id)).toBe(0);
  });

  test('markRead is ownership-scoped', async () => {
    const a = await notifyWeeklyReportReady(user.id, { id: 3, week_key: '2026-W28', metrics_snapshot: {} });
    const other = await User.create({
      username: 'other_n',
      email: 'othern@test.com',
      hashed_password: 'Password1!',
      verified_email: true,
      is_active: true,
    });
    const denied = await markRead(a.notification.id, other.id);
    expect(denied).toBeNull();
  });
});
