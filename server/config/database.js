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

/**
 * Test the database connection
 */
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log(`✅ ${dialect.toUpperCase()} connection established successfully.`);
  } catch (error) {
    console.error(`❌ Unable to connect to ${dialect}:`, error.message);
    process.exit(1);
  }
};

module.exports = { sequelize, testConnection };