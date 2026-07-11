// Encrypted field search must match plaintext after AES at-rest (not SQL LIKE).
// IDOR: list/search always scoped to req.user.id.

const { Sequelize, DataTypes } = require('sequelize');

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-for-jest-32ch';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-min-16-chars!!';

jest.mock('../server/config/database', () => {
  const { Sequelize: S } = require('sequelize');
  const sequelize = new S({ dialect: 'sqlite', storage: ':memory:', logging: false });
  return { sequelize, testConnection: jest.fn() };
});

const { sequelize } = require('../server/config/database');
const HealthLog = require('../server/models/HealthLog');
const FinancialLog = require('../server/models/FinancialLog');
const Category = require('../server/models/Category');
const { getHealthLogs } = require('../server/controllers/healthController');
const { getFinanceLogs } = require('../server/controllers/financeController');
const { isEncrypted } = require('../server/utils/encryption');

HealthLog.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });
FinancialLog.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });

const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('encrypted search + ownership (health/finance)', () => {
  beforeAll(async () => {
    // FK targets referenced by health/finance models
    sequelize.define('users', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    }, { tableName: 'users', timestamps: false });
    await sequelize.sync({ force: true });
    await sequelize.query(
      'INSERT INTO users (id) VALUES (1), (2), (5), (6), (99)',
    );
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await sequelize.query('DELETE FROM health_logs');
    await sequelize.query('DELETE FROM financial_logs');
  });

  test('health notes are ciphertext in DB and searchable by plaintext for owner', async () => {
    await HealthLog.create({
      user_id: 1,
      type: 'nutrition',
      value: 500,
      notes: 'grilled chicken salad',
      source: 'manual',
      logged_at: new Date(),
    });
    await HealthLog.create({
      user_id: 2,
      type: 'nutrition',
      value: 500,
      notes: 'grilled chicken salad',
      source: 'manual',
      logged_at: new Date(),
    });

    const [raw] = await sequelize.query(
      'SELECT notes FROM health_logs WHERE user_id = 1 LIMIT 1',
      { type: Sequelize.QueryTypes.SELECT },
    );
    expect(isEncrypted(raw.notes)).toBe(true);
    expect(raw.notes).not.toContain('chicken');

    const res = mockRes();
    await getHealthLogs(
      { user: { id: 1 }, query: { search: 'chicken' } },
      res,
      (e) => { throw e; },
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.data.length).toBe(1);
    expect(payload.data[0].notes).toMatch(/chicken/i);
    expect(payload.data[0].user_id).toBe(1);
  });

  test('health search never returns another user row', async () => {
    await HealthLog.create({
      user_id: 99,
      type: 'mood',
      value: 3,
      notes: 'unique-secret-phrase-xyz',
      source: 'manual',
      logged_at: new Date(),
    });
    const res = mockRes();
    await getHealthLogs(
      { user: { id: 1 }, query: { search: 'unique-secret-phrase-xyz' } },
      res,
      (e) => { throw e; },
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.data).toEqual([]);
  });

  test('finance description search works over ciphertext for owner only', async () => {
    await FinancialLog.create({
      user_id: 5,
      type: 'expense',
      amount: 12.5,
      currency: 'USD',
      description: 'live-qa coffee shop',
      source: 'manual',
      logged_at: new Date(),
    });
    await FinancialLog.create({
      user_id: 6,
      type: 'expense',
      amount: 12.5,
      currency: 'USD',
      description: 'live-qa coffee shop',
      source: 'manual',
      logged_at: new Date(),
    });

    const [raw] = await sequelize.query(
      'SELECT description FROM financial_logs WHERE user_id = 5 LIMIT 1',
      { type: Sequelize.QueryTypes.SELECT },
    );
    expect(isEncrypted(raw.description)).toBe(true);

    const res = mockRes();
    await getFinanceLogs(
      { user: { id: 5 }, query: { search: 'coffee' } },
      res,
      (e) => { throw e; },
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.length).toBe(1);
    expect(payload.data[0].description).toMatch(/coffee/i);
    expect(payload.data[0].user_id).toBe(5);
  });
});
