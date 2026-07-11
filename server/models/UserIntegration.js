// server/models/UserIntegration.js
// ============================================
// External Integration Tokens
// ============================================
// Durable per-user OAuth tokens for health platforms (Google Fit, …).
// Previously an in-memory Map in externalRoutes — every deploy or restart
// silently disconnected every user. Tokens are AES-encrypted at rest with
// the same field-encryption used for log text.
// ============================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserIntegration = sequelize.define('user_integrations', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE',
  },
  platform: {
    type: DataTypes.STRING(40),
    allowNull: false,
    comment: 'Adapter key, e.g. google_fit / apple_health.',
  },
  access_token: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  refresh_token: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  expires_in: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Provider-reported access-token lifetime in seconds.',
  },
  connected_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'user_integrations',
  timestamps: true,
  underscored: true,
  indexes: [
    { unique: true, fields: ['user_id', 'platform'] },
  ],
  hooks: {
    beforeCreate: (instance) => {
      const { encryptFields } = require('../utils/encryption');
      encryptFields(instance, ['access_token', 'refresh_token']);
    },
    beforeUpdate: (instance) => {
      const { encryptFields } = require('../utils/encryption');
      const changed = ['access_token', 'refresh_token'].filter((f) => instance.changed(f));
      if (changed.length) encryptFields(instance, changed);
    },
    afterFind: (results) => {
      const { decryptFields } = require('../utils/encryption');
      if (!results) return;
      const instances = Array.isArray(results) ? results : [results];
      instances.forEach((instance) => {
        if (instance && instance.getDataValue) {
          decryptFields(instance, ['access_token', 'refresh_token']);
        }
      });
    },
  },
});

module.exports = UserIntegration;
