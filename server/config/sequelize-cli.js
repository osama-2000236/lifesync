// server/config/sequelize-cli.js
// Used by Sequelize CLI for migrations and seeders
require('dotenv').config();

const dialect = process.env.DB_DIALECT || 'mysql';
const config = {
  define: {
    underscored: true,
    freezeTableName: true,
  },
  dialect: dialect,
};

if (dialect === 'sqlite') {
  config.storage = process.env.DB_STORAGE || './lifesync_db.sqlite';
} else {
  // MySQL configuration
  config.host = process.env.DB_HOST;
  config.port = process.env.DB_PORT || 3306;
}

module.exports = {
  development: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ...config,
  },
  test: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: `${process.env.DB_NAME}_test`,
    ...config,
    logging: false,
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ...config,
    logging: false,
    pool: {
      max: 20,
      min: 5,
      acquire: 30000,
      idle: 10000,
    },
  },
};
