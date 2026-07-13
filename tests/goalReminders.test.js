// Goal reminder sweep: budget-limit + hydration nudges (dashboard promise).

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-32-characters!!';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-32-chars!!';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-for-jest-32ch';

const {
  sequelize, User, UserNotification, UserGoal, FinancialLog, HealthLog,
} = require('../server/models');
const { runGoalReminderJob } = require('../server/services/notificationService');

// Dates pinned to the REAL current UTC day: createDailyOnce compares the job's
// day window against DB created_at (real clock), so fixture days must match.
const now = new Date();
const utcDay = (h) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h));
const EVENING = utcDay(18); // past the hydration evening gate
const MORNING = utcDay(9);  // before the gate

describe('runGoalReminderJob', () => {
  let user;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  beforeEach(async () => {
    await UserNotification.destroy({ where: {} });
    await UserGoal.destroy({ where: {} });
    await FinancialLog.destroy({ where: {} });
    await HealthLog.destroy({ where: {} });
    await User.destroy({ where: {} });
    user = await User.create({
      username: 'goal_user',
      email: 'goal@test.com',
      hashed_password: 'Password1!',
      verified_email: true,
      is_active: true,
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  const START = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const budgetGoal = () => UserGoal.create({
    user_id: user.id, domain: 'finance', metric_type: 'budget',
    target_value: 100, unit: 'USD', period: 'monthly', status: 'active', start_date: START,
  });

  const waterGoal = () => UserGoal.create({
    user_id: user.id, domain: 'health', metric_type: 'water',
    target_value: 8, unit: 'cups', period: 'daily', status: 'active', start_date: START,
  });

  test('budget over target fires once per day, not per run', async () => {
    await budgetGoal();
    await FinancialLog.create({
      user_id: user.id, type: 'expense', amount: 150, currency: 'USD',
      description: 'overspend', logged_at: MORNING,
    });

    const first = await runGoalReminderJob({ at: MORNING });
    expect(first).toHaveLength(1);
    expect(first[0].type).toBe('budget_limit');
    expect(first[0].body).toMatch(/150/);

    const second = await runGoalReminderJob({ at: MORNING });
    expect(second).toHaveLength(0);
    expect(await UserNotification.count({ where: { user_id: user.id } })).toBe(1);
  });

  test('budget under target stays silent', async () => {
    await budgetGoal();
    await FinancialLog.create({
      user_id: user.id, type: 'expense', amount: 40, currency: 'USD',
      description: 'fine', logged_at: MORNING,
    });
    expect(await runGoalReminderJob({ at: MORNING })).toHaveLength(0);
  });

  test('hydration nudges in the evening only, and only when behind', async () => {
    await waterGoal();
    await HealthLog.create({
      user_id: user.id, type: 'water', value: 2, source: 'manual',
      logged_at: utcDay(8),
    });

    expect(await runGoalReminderJob({ at: MORNING })).toHaveLength(0); // before gate

    const evening = await runGoalReminderJob({ at: EVENING });
    expect(evening).toHaveLength(1);
    expect(evening[0].type).toBe('hydration');

    // Goal met → silent even in the evening.
    await UserNotification.destroy({ where: {} });
    await HealthLog.create({
      user_id: user.id, type: 'water', value: 10, source: 'manual',
      logged_at: utcDay(9),
    });
    expect(await runGoalReminderJob({ at: EVENING })).toHaveLength(0);
  });
});
