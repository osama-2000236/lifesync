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
});

