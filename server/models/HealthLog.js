// server/models/HealthLog.js
// ============================================
// Health Log Model
// Tracks: steps, sleep, mood, nutrition, water
// ============================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const HealthLog = sequelize.define('health_logs', {
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
    type: DataTypes.ENUM('steps', 'sleep', 'mood', 'nutrition', 'water', 'exercise', 'heart_rate'),
    allowNull: false,
    comment: 'The health metric being tracked',
  },
  value: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Numeric value (e.g., 8000 steps, 3 mood rating, 2.5L water)',
  },
  value_text: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Optional text value for descriptive entries (e.g., "grilled chicken salad")',
  },
  unit: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Unit of measurement (steps, hours, rating, kcal, liters, bpm)',
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Duration in minutes (primarily for sleep and exercise)',
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  logged_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'When the activity actually occurred',
  },
  source: {
    type: DataTypes.ENUM('manual', 'nlp', 'google_fit', 'apple_health', 'api'),
    allowNull: false,
    defaultValue: 'nlp',
    comment: 'How this entry was created',
  },
}, {
  tableName: 'health_logs',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id', 'type', 'logged_at'] },
    { fields: ['user_id', 'logged_at'] },
    { fields: ['type'] },
  ],
  hooks: {
    /**
     * Encrypt sensitive text fields before saving to database
     * Numeric fields (value, duration) remain unencrypted for SQL aggregation
     * In production, use MySQL TDE for full at-rest encryption of numeric data
     */
    beforeCreate: (instance) => {
      const { encryptFields } = require('../utils/encryption');
      encryptFields(instance, ['notes', 'value_text']);
    },
    beforeUpdate: (instance) => {
      const { encryptFields } = require('../utils/encryption');
      if (instance.changed('notes') || instance.changed('value_text')) {
        encryptFields(instance, ['notes', 'value_text']);
      }
    },
    afterFind: (results) => {
      const { decryptFields } = require('../utils/encryption');
      if (!results) return;
      const instances = Array.isArray(results) ? results : [results];
      instances.forEach((instance) => {
        if (instance && instance.getDataValue) {
          decryptFields(instance, ['notes', 'value_text']);
        }
      });
    },
  },
});

module.exports = HealthLog;
