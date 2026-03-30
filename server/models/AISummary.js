// server/models/AISummary.js
// ============================================
// AI Summary Model
// Stores weekly generated insights, behavioral patterns,
// and personalized recommendations
// ============================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AISummary = sequelize.define('ai_summaries', {
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
  type: {
    type: DataTypes.ENUM('health', 'finance', 'combined', 'behavioral'),
    allowNull: false,
    comment: 'The domain this insight covers',
  },
  period_start: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Start of the analysis period',
  },
  period_end: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'End of the analysis period',
  },
  summary: {
    type: DataTypes.TEXT('long'),
    allowNull: false,
    comment: 'Human-readable summary of the period',
  },
  patterns: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Detected behavioral patterns as structured JSON',
    // Example: { "coffee_spending_trend": "up_20%", "sleep_correlation": "negative" }
  },
  recommendations: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Actionable AI recommendations as structured JSON array',
    // Example: [{ "text": "Reduce coffee spending", "priority": "high", "domain": "finance" }]
  },
  metrics_snapshot: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Key metrics for the period (avg sleep, total spending, etc.)',
  },
  is_read: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  generated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'ai_summaries',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id', 'type'] },
    { fields: ['user_id', 'period_start', 'period_end'] },
    { fields: ['generated_at'] },
  ],
});

module.exports = AISummary;
