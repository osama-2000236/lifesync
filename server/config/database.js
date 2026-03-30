// server/config/database.js
// ============================================
// MySQL Connection via Sequelize
// ============================================

const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
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
  }
);

/**
 * Test the database connection
 */
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ MySQL connection established successfully.');
  } catch (error) {
    console.error('❌ Unable to connect to MySQL:', error.message);
    process.exit(1);
  }
};

module.exports = { sequelize, testConnection };
