// server/config/runMigrations.js
// ============================================
// Apply pending Sequelize migrations on boot.
// Tracks applied files in SequelizeMeta (same table sequelize-cli uses).
//
// Production safety: if the database already has tables but SequelizeMeta is
// empty (first time enabling boot migrations), we *baseline* already-applied
// migrations by inspecting the schema — never re-run 001 on a live DB.
// ============================================

const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

const tableNames = async (qi) => {
  const tables = await qi.showAllTables();
  return new Set(tables.map((t) => (typeof t === 'string' ? t : t.tableName || t.name)));
};

const hasColumn = async (qi, table, column) => {
  try {
    const desc = await qi.describeTable(table);
    return Boolean(desc[column]);
  } catch {
    return false;
  }
};

/**
 * Heuristic: which migration files are already reflected in the live schema?
 * Used only when SequelizeMeta is empty on a non-empty database.
 */
const isMigrationAlreadyInSchema = async (qi, file, tables) => {
  switch (file) {
    case '20250208-001-initial-schema.js':
      return tables.has('users') && tables.has('categories') && tables.has('health_logs');
    case '20260410-002-add-status-to-chat-logs.js':
      return tables.has('chat_logs') && (await hasColumn(qi, 'chat_logs', 'status'));
    case '20260620-003-add-user-memory-and-preferred-model.js':
      return (await hasColumn(qi, 'users', 'preferred_model')) && tables.has('user_memories');
    case '20260710-004-health-value-text-to-text.js':
      // Column type change — if value_text exists, treat as applied.
      // Must await: a bare Promise is always truthy and would false-baseline.
      return await hasColumn(qi, 'health_logs', 'value_text');
    case '20260711-005-add-user-integrations.js':
      return tables.has('user_integrations');
    case '20260711-006-weekly-reports-and-notifications.js':
      return tables.has('weekly_reports')
        && tables.has('user_notifications')
        && (await hasColumn(qi, 'users', 'report_notify_enabled'));
    case '20260711-007-integration-token-expires-at.js':
      return await hasColumn(qi, 'user_integrations', 'token_expires_at');
    case '20260711-008-avatar-url-text.js':
      // Column type change — if avatar_url exists, treat as applied.
      return await hasColumn(qi, 'users', 'avatar_url');
    case '20260717-009-password-changed-at.js':
      return await hasColumn(qi, 'users', 'password_changed_at');
    default:
      // Unknown newer migration: must run.
      return false;
  }
};

const ensureMetaTable = async (sequelize) => {
  const dialect = sequelize.getDialect();
  if (dialect === 'sqlite') {
    await sequelize.query(
      'CREATE TABLE IF NOT EXISTS `SequelizeMeta` (`name` VARCHAR(255) NOT NULL PRIMARY KEY)',
    );
  } else {
    await sequelize.query(
      'CREATE TABLE IF NOT EXISTS `SequelizeMeta` (`name` VARCHAR(255) NOT NULL, PRIMARY KEY (`name`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    );
  }
};

const markApplied = async (sequelize, file) => {
  await sequelize.query('INSERT INTO `SequelizeMeta` (`name`) VALUES (?)', {
    replacements: [file],
  });
};

/**
 * @param {import('sequelize').Sequelize} sequelize
 * @returns {Promise<{ applied: string[], skipped: string[], baselined: string[] }>}
 */
const runMigrations = async (sequelize) => {
  const qi = sequelize.getQueryInterface();
  await ensureMetaTable(sequelize);

  const [rows] = await sequelize.query('SELECT `name` FROM `SequelizeMeta`');
  let done = new Set((rows || []).map((r) => r.name));

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.js'))
    .sort();

  const baselined = [];

  // First boot on an existing production DB: populate meta without re-running history.
  if (done.size === 0) {
    const tables = await tableNames(qi);
    if (tables.has('users')) {
      console.log('[migrate] empty SequelizeMeta on existing DB — baselining applied migrations…');
      for (const file of files) {
        // eslint-disable-next-line no-await-in-loop
        const already = await isMigrationAlreadyInSchema(qi, file, tables);
        if (already) {
          // eslint-disable-next-line no-await-in-loop
          await markApplied(sequelize, file);
          baselined.push(file);
          done.add(file);
          console.log(`[migrate] baselined ${file}`);
        }
      }
    }
  }

  const applied = [];
  const skipped = [];

  for (const file of files) {
    if (done.has(file)) {
      skipped.push(file);
      continue;
    }
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const migration = require(path.join(MIGRATIONS_DIR, file));
    if (typeof migration.up !== 'function') {
      throw new Error(`Migration ${file} has no up()`);
    }
    console.log(`[migrate] applying ${file}…`);
    try {
      await migration.up(qi, Sequelize);
    } catch (err) {
      // Idempotent escape: if the change already exists, record and continue.
      const msg = String(err?.parent?.sqlMessage || err?.message || '');
      if (/Duplicate key name|already exists|Duplicate column name/i.test(msg)) {
        console.warn(`[migrate] ${file} already reflected in schema (${msg}) — marking applied`);
        await markApplied(sequelize, file);
        baselined.push(file);
        continue;
      }
      throw err;
    }
    await markApplied(sequelize, file);
    applied.push(file);
    console.log(`[migrate] applied ${file}`);
  }

  return { applied, skipped, baselined };
};

module.exports = { runMigrations, isMigrationAlreadyInSchema };
