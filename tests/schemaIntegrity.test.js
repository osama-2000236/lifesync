// tests/schemaIntegrity.test.js
// Phase 2 — migrations apply/reverse, model↔schema parity, cascade delete, seed idempotency.
const fs = require('fs');
const path = require('path');
const { Sequelize, QueryTypes } = require('sequelize');

const MIGRATIONS = [
  '20250208-001-initial-schema.js',
  '20260410-002-add-status-to-chat-logs.js',
  '20260620-003-add-user-memory-and-preferred-model.js',
  '20260710-004-health-value-text-to-text.js',
  '20260711-005-add-user-integrations.js',
  '20260711-006-weekly-reports-and-notifications.js',
  '20260711-007-integration-token-expires-at.js',
];

const MODEL_TABLES = {
  users: () => require('../server/models/User'),
  categories: () => require('../server/models/Category'),
  health_logs: () => require('../server/models/HealthLog'),
  financial_logs: () => require('../server/models/FinancialLog'),
  linked_domains: () => require('../server/models/LinkedDomain'),
  ai_summaries: () => require('../server/models/AISummary'),
  chat_logs: () => require('../server/models/ChatLog'),
  user_goals: () => require('../server/models/UserGoal'),
  system_logs: () => require('../server/models/SystemLog'),
  user_memories: () => require('../server/models/UserMemory'),
  user_integrations: () => require('../server/models/UserIntegration'),
  weekly_reports: () => require('../server/models/WeeklyReport'),
  user_notifications: () => require('../server/models/UserNotification'),
};

const attrToColumn = (name, attr) => {
  if (attr.field) return attr.field;
  if (name === 'createdAt') return 'created_at';
  if (name === 'updatedAt') return 'updated_at';
  return name;
};

const openMigratedDb = async (dbPath) => {
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
    logging: false,
    define: { underscored: true, freezeTableName: true },
  });
  await sequelize.query('PRAGMA foreign_keys = ON');
  const qi = sequelize.getQueryInterface();
  for (const file of MIGRATIONS) {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const migration = require(path.join(__dirname, '..', 'server', 'migrations', file));
    await migration.up(qi, Sequelize);
  }
  return { sequelize, qi };
};

describe('schema integrity (models + migrations)', () => {
  const dbPath = path.join(__dirname, `schema-integrity-${process.pid}.sqlite`);
  let sequelize;
  let qi;

  beforeAll(async () => {
    ({ sequelize, qi } = await openMigratedDb(dbPath));
  });

  afterAll(async () => {
    if (sequelize) await sequelize.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  test('money amounts are DECIMAL, not FLOAT', () => {
    const FinancialLog = require('../server/models/FinancialLog');
    const HealthLog = require('../server/models/HealthLog');
    const UserGoal = require('../server/models/UserGoal');
    expect(FinancialLog.rawAttributes.amount.type.key).toBe('DECIMAL');
    expect(HealthLog.rawAttributes.value.type.key).toBe('DECIMAL');
    expect(UserGoal.rawAttributes.target_value.type.key).toBe('DECIMAL');
    expect(UserGoal.rawAttributes.current_value.type.key).toBe('DECIMAL');
  });

  test('encrypted health value_text column is TEXT (ciphertext overflows 255)', () => {
    const HealthLog = require('../server/models/HealthLog');
    // Bug class: STRING(255) + AES hooks → MySQL truncation / Data too long
    expect(HealthLog.rawAttributes.value_text.type.key).toBe('TEXT');
    const { encrypt } = require('../server/utils/encryption');
    const cipher = encrypt('x'.repeat(200));
    expect(cipher.length).toBeGreaterThan(255);
  });

  test('every model attribute has a migrated column', async () => {
    for (const [table, load] of Object.entries(MODEL_TABLES)) {
      const Model = load();
      const desc = await qi.describeTable(table);
      const cols = Object.keys(desc);
      for (const [attrName, attr] of Object.entries(Model.rawAttributes)) {
        const col = attrToColumn(attrName, attr);
        expect(cols).toContain(col);
      }
    }
  });

  test('chat_logs.status and users.preferred_model exist after 002/003', async () => {
    const chat = await qi.describeTable('chat_logs');
    const users = await qi.describeTable('users');
    expect(chat.status).toBeDefined();
    expect(users.preferred_model).toBeDefined();
    const memories = await qi.describeTable('user_memories');
    expect(memories.mem_key).toBeDefined();
  });

  test('deleting a user cascades dependent rows (FK onDelete)', async () => {
    await sequelize.query('PRAGMA foreign_keys = ON');
    const fkRows = await sequelize.query('PRAGMA foreign_keys', { type: QueryTypes.SELECT });
    expect(Number(fkRows[0].foreign_keys)).toBe(1);

    const one = async (sql) => {
      const rows = await sequelize.query(sql, { type: QueryTypes.SELECT });
      return rows[0];
    };
    const count = async (sql) => {
      const row = await one(sql);
      return Number(Object.values(row)[0]);
    };

    await sequelize.query(
      `INSERT INTO users (username, email, verified_email, role, is_active, preferred_model, created_at, updated_at)
       VALUES ('cascade_u', 'cascade@test.local', 1, 'user', 1, 'bert_local', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    );
    const { id: userId } = await one(`SELECT id FROM users WHERE username = 'cascade_u'`);

    await sequelize.query(
      `INSERT INTO health_logs (user_id, type, value, logged_at, source, created_at, updated_at)
       VALUES (${userId}, 'steps', 1000, CURRENT_TIMESTAMP, 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    );
    await sequelize.query(
      `INSERT INTO financial_logs (user_id, type, amount, currency, logged_at, source, created_at, updated_at)
       VALUES (${userId}, 'expense', 12.50, 'USD', CURRENT_TIMESTAMP, 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    );
    await sequelize.query(
      `INSERT INTO chat_logs (user_id, session_id, role, message, status, created_at, updated_at)
       VALUES (${userId}, 's1', 'user', 'hi', 'complete', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    );
    await sequelize.query(
      `INSERT INTO user_goals (user_id, domain, metric_type, target_value, current_value, period, start_date, status, created_at, updated_at)
       VALUES (${userId}, 'health', 'steps', 10000, 0, 'weekly', date('now'), 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    );
    await sequelize.query(
      `INSERT INTO ai_summaries (user_id, type, period_start, period_end, summary, is_read, generated_at, created_at, updated_at)
       VALUES (${userId}, 'health', date('now'), date('now'), 'summary', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    );
    await sequelize.query(
      `INSERT INTO user_memories (user_id, mem_key, category, value, confidence, source, salience, times_seen, created_at, updated_at)
       VALUES (${userId}, 'name', 'profile', 'Test', 0.9, 'chat', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    );
    await sequelize.query(
      `INSERT INTO categories (name, domain, is_default, user_id, created_at, updated_at)
       VALUES ('Custom', 'health', 0, ${userId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    );
    // system_logs.admin_id is SET NULL, not cascade
    await sequelize.query(
      `INSERT INTO system_logs (admin_id, log_type, action, severity, created_at, updated_at)
       VALUES (${userId}, 'audit', 'test_action', 'info', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    );

    const { hid } = await one(`SELECT id AS hid FROM health_logs WHERE user_id = ${userId}`);
    const { fid } = await one(`SELECT id AS fid FROM financial_logs WHERE user_id = ${userId}`);
    await sequelize.query(
      `INSERT INTO linked_domains (health_log_id, financial_log_id, link_type, created_at, updated_at)
       VALUES (${hid}, ${fid}, 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    );

    await sequelize.query(`DELETE FROM users WHERE id = ${userId}`);

    expect(await count(`SELECT COUNT(*) AS c FROM health_logs WHERE user_id = ${userId}`)).toBe(0);
    expect(await count(`SELECT COUNT(*) AS c FROM financial_logs WHERE user_id = ${userId}`)).toBe(0);
    expect(await count(`SELECT COUNT(*) AS c FROM chat_logs WHERE user_id = ${userId}`)).toBe(0);
    expect(await count(`SELECT COUNT(*) AS c FROM user_goals WHERE user_id = ${userId}`)).toBe(0);
    expect(await count(`SELECT COUNT(*) AS c FROM ai_summaries WHERE user_id = ${userId}`)).toBe(0);
    expect(await count(`SELECT COUNT(*) AS c FROM user_memories WHERE user_id = ${userId}`)).toBe(0);
    expect(await count(`SELECT COUNT(*) AS c FROM categories WHERE user_id = ${userId}`)).toBe(0);
    expect(await count(`SELECT COUNT(*) AS c FROM linked_domains WHERE health_log_id = ${hid}`)).toBe(0);
    // SET NULL preserves the audit row
    expect(await count(`SELECT COUNT(*) AS c FROM system_logs WHERE action = 'test_action'`)).toBe(1);
    expect(await count(`SELECT COUNT(*) AS c FROM system_logs WHERE action = 'test_action' AND admin_id IS NULL`)).toBe(1);
  });

  test('migrations 002–004 down then up reapply cleanly', async () => {
    const revPath = path.join(__dirname, `schema-rev-${process.pid}.sqlite`);
    const s = new Sequelize({ dialect: 'sqlite', storage: revPath, logging: false });
    const rqi = s.getQueryInterface();
    for (const file of MIGRATIONS) {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      await require(path.join(__dirname, '..', 'server', 'migrations', file)).up(rqi, Sequelize);
    }
    // reverse order down
    for (const file of [...MIGRATIONS].reverse()) {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      await require(path.join(__dirname, '..', 'server', 'migrations', file)).down(rqi, Sequelize);
    }
    // 001 down drops users — re-up full stack
    for (const file of MIGRATIONS) {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      await require(path.join(__dirname, '..', 'server', 'migrations', file)).up(rqi, Sequelize);
    }
    const chat = await rqi.describeTable('chat_logs');
    const users = await rqi.describeTable('users');
    expect(chat.status).toBeDefined();
    expect(users.preferred_model).toBeDefined();
    await s.close();
    if (fs.existsSync(revPath)) fs.unlinkSync(revPath);
  });

  test('index associations declare onDelete for user-owned relations', () => {
    // Re-require after models/index loaded associations
    const db = require('../server/models');
    const healthAssoc = db.User.associations.healthLogs;
    expect(healthAssoc).toBeDefined();
    expect(healthAssoc.options.onDelete).toBe('CASCADE');
    const sysAssoc = db.User.associations.adminLogs;
    expect(sysAssoc.options.onDelete).toBe('SET NULL');
  });
});

describe('seed idempotency', () => {
  test('default category findOrCreate does not duplicate on second pass', async () => {
    const db = require('../server/models');
    await db.sequelize.authenticate();
    // Match seed.js: sync before findOrCreate. CI uses DB_STORAGE=:memory:
    // with no prior migrate — without this, SELECT hits no such table: categories.
    await db.sequelize.sync({ force: false });
    // Use unique names so we never collide with real seed data permanently
    const tag = `seed_test_${process.pid}`;
    const cat = {
      name: tag,
      domain: 'health',
      icon: 'x',
      color: '#000000',
      is_default: true,
      user_id: null,
    };

    const runOnce = async () => {
      const [row, created] = await db.Category.findOrCreate({
        where: { name: cat.name, domain: cat.domain, is_default: true },
        defaults: cat,
      });
      return { id: row.id, created };
    };

    const first = await runOnce();
    const second = await runOnce();
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
    const count = await db.Category.count({ where: { name: tag } });
    expect(count).toBe(1);
    await db.Category.destroy({ where: { name: tag } });
  });
});
