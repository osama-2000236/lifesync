// Unit/integration: boot-time migration runner

const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');
const { runMigrations } = require('../server/config/runMigrations');

describe('runMigrations', () => {
  const dbPath = path.join(__dirname, `migrate-boot-${process.pid}.sqlite`);
  let sequelize;

  beforeEach(async () => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    sequelize = new Sequelize({
      dialect: 'sqlite',
      storage: dbPath,
      logging: false,
    });
  });

  afterEach(async () => {
    if (sequelize) await sequelize.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  test('applies all migrations then is idempotent', async () => {
    const first = await runMigrations(sequelize);
    expect(first.applied.length).toBeGreaterThan(0);
    expect(first.skipped.length).toBe(0);

    const second = await runMigrations(sequelize);
    expect(second.applied.length).toBe(0);
    expect(second.skipped.length).toBe(first.applied.length + (first.baselined?.length || 0));

    // New tables from 006 exist
    const tables = await sequelize.getQueryInterface().showAllTables();
    const names = tables.map((t) => (typeof t === 'string' ? t : t.name));
    expect(names).toEqual(expect.arrayContaining(['weekly_reports', 'user_notifications', 'user_integrations']));
  });

  test('baselines existing schema without re-running 001', async () => {
    // Simulate a pre-existing DB: apply migrations once, wipe meta only.
    await runMigrations(sequelize);
    await sequelize.query('DELETE FROM `SequelizeMeta`');

    const again = await runMigrations(sequelize);
    // Should baseline (not re-apply) everything already present
    expect(again.baselined.length).toBeGreaterThan(0);
    expect(again.applied.length).toBe(0);
  });

  test('baseline does not mark 007/008 applied when columns are missing', async () => {
    // Real bug class: missing await on hasColumn made Promises truthy → false baseline.
    const { isMigrationAlreadyInSchema } = require('../server/config/runMigrations');
    const qi = sequelize.getQueryInterface();
    // Minimal "users" world without integrations / avatar upgrade path
    await qi.createTable('users', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      email: { type: Sequelize.STRING },
    });
    const tables = new Set(['users']);
    await expect(
      isMigrationAlreadyInSchema(qi, '20260711-007-integration-token-expires-at.js', tables),
    ).resolves.toBe(false);
    await expect(
      isMigrationAlreadyInSchema(qi, '20260711-008-avatar-url-text.js', tables),
    ).resolves.toBe(false);
    await expect(
      isMigrationAlreadyInSchema(qi, '20260710-004-health-value-text-to-text.js', tables),
    ).resolves.toBe(false);
  });

  test('baseline applies 007 only after user_integrations.token_expires_at exists', async () => {
    const { isMigrationAlreadyInSchema } = require('../server/config/runMigrations');
    const qi = sequelize.getQueryInterface();
    await qi.createTable('user_integrations', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: Sequelize.INTEGER },
    });
    const tables = new Set(['users', 'user_integrations']);
    await expect(
      isMigrationAlreadyInSchema(qi, '20260711-007-integration-token-expires-at.js', tables),
    ).resolves.toBe(false);
    await qi.addColumn('user_integrations', 'token_expires_at', { type: Sequelize.DATE, allowNull: true });
    await expect(
      isMigrationAlreadyInSchema(qi, '20260711-007-integration-token-expires-at.js', tables),
    ).resolves.toBe(true);
  });
});

