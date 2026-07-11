// server/config/runMigrations.js
// ============================================
// Apply pending Sequelize migrations on boot.
// Avoids needing DB_ALTER=true for new columns/tables in production.
// Tracks applied files in SequelizeMeta (same table sequelize-cli uses).
// ============================================

const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

/**
 * @param {import('sequelize').Sequelize} sequelize
 * @returns {Promise<{ applied: string[], skipped: string[] }>}
 */
const runMigrations = async (sequelize) => {
  const qi = sequelize.getQueryInterface();
  const dialect = sequelize.getDialect();

  // Ensure meta table exists (MySQL + SQLite compatible).
  if (dialect === 'sqlite') {
    await sequelize.query(
      'CREATE TABLE IF NOT EXISTS `SequelizeMeta` (`name` VARCHAR(255) NOT NULL PRIMARY KEY)',
    );
  } else {
    await sequelize.query(
      'CREATE TABLE IF NOT EXISTS `SequelizeMeta` (`name` VARCHAR(255) NOT NULL, PRIMARY KEY (`name`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    );
  }

  const [rows] = await sequelize.query('SELECT `name` FROM `SequelizeMeta`');
  const done = new Set((rows || []).map((r) => r.name));

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.js'))
    .sort();

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
    await migration.up(qi, Sequelize);
    await sequelize.query('INSERT INTO `SequelizeMeta` (`name`) VALUES (?)', {
      replacements: [file],
    });
    applied.push(file);
    console.log(`[migrate] applied ${file}`);
  }

  return { applied, skipped };
};

module.exports = { runMigrations };
