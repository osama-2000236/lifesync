// server/models/FinancialLog.js
// ============================================
// Financial Log Model
// Tracks: income, expenses by category
// ============================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const FinancialLog = sequelize.define('financial_logs', {
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
  category_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'categories', key: 'id' },
    onDelete: 'SET NULL',
  },
  type: {
    type: DataTypes.ENUM('income', 'expense'),
    allowNull: false,
    comment: 'Whether this is money coming in or going out',
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    validate: {
      min: 0.01,
    },
    comment: 'Transaction amount (always positive; type determines direction)',
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD',
    comment: 'ISO 4217 currency code',
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'User-provided or NLP-extracted description',
  },
  logged_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'When the transaction actually occurred',
  },
  source: {
    type: DataTypes.ENUM('manual', 'nlp', 'api'),
    allowNull: false,
    defaultValue: 'nlp',
    comment: 'How this entry was created',
  },
}, {
  tableName: 'financial_logs',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id', 'type', 'logged_at'] },
    { fields: ['user_id', 'logged_at'] },
    { fields: ['user_id', 'category_id'] },
  ],
  hooks: {
    /**
     * Encrypt sensitive text fields before saving
     * Amount remains unencrypted for SQL aggregation (SUM, AVG, GROUP BY)
     * In production, use MySQL TDE for full at-rest encryption
     */
    beforeCreate: (instance) => {
      const { encryptFields } = require('../utils/encryption');
      encryptFields(instance, ['description']);
    },
    beforeUpdate: (instance) => {
      const { encryptFields } = require('../utils/encryption');
      if (instance.changed('description')) {
        encryptFields(instance, ['description']);
      }
    },
    afterFind: (results) => {
      const { decryptFields } = require('../utils/encryption');
      if (!results) return;
      const instances = Array.isArray(results) ? results : [results];
      instances.forEach((instance) => {
        if (instance && instance.getDataValue) {
          decryptFields(instance, ['description']);
        }
      });
    },
  },
});

module.exports = FinancialLog;
