// server/config/database.js
// ============================================
// Database Connection via Sequelize
// Supports MySQL and SQLite
// ============================================

const { Sequelize } = require('sequelize');
require('dotenv').config();

const dialect = process.env.DB_DIALECT || 'mysql';
const config = {
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  define: {
    timestamps: true,      // Adds createdAt, updatedAt
    underscored: true,     // Uses snake_case column names
    freezeTableName: true, // Prevents Sequelize from pluralizing
  },
  timezone: '+00:00', // Store all dates in UTC
};

if (dialect === 'sqlite') {
  config.dialect = 'sqlite';
  config.storage = process.env.DB_STORAGE || './lifesync_db.sqlite';
} else {
  // MySQL configuration
  config.dialect = 'mysql';
  config.host = process.env.DB_HOST;
  config.port = process.env.DB_PORT || 3306;
}

// Initialize Sequelize
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  config
);

// SQLite: raw node-sqlite3 leaves foreign_keys OFF; CASCADE FKs from migrations
// are then no-ops and User deletes orphan child rows. Sequelize usually enables
// this per connection — pin it after every connect so cascade is real.
if (dialect === 'sqlite') {
  sequelize.addHook('afterConnect', async (connection) => {
    await new Promise((resolve, reject) => {
      connection.run('PRAGMA foreign_keys = ON', (err) => (err ? reject(err) : resolve()));
    });
  });
}

/**
 * Test the database connection
 */
const testConnection = async () => {
  if (dialect === 'mysql' && !process.env.DB_HOST) {
    console.error(
      '❌ DB_HOST is not set. On a host like Railway, map the MySQL plugin ' +
      'variables to the DB_* names this app expects, e.g. ' +
      'DB_HOST=${{MySQL.MYSQLHOST}}, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT.'
    );
    process.exit(1);
  }

  try {
    await sequelize.authenticate();
    console.log(`✅ ${dialect.toUpperCase()} connection established successfully.`);
  } catch (error) {
    // Surface the real cause — message is often empty for a bad/undefined host.
    console.error(`❌ Unable to connect to ${dialect}: ${error.message || error.code || error}`);
    if (dialect === 'mysql') {
      console.error(
        `   tried host=${process.env.DB_HOST} port=${process.env.DB_PORT || 3306} ` +
        `db=${process.env.DB_NAME} user=${process.env.DB_USER}`
      );
    }
    process.exit(1);
  }
};

module.exports = { sequelize, testConnection };