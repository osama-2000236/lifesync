// server/models/WeeklyReport.js
// Immutable weekly health+finance snapshot for PDF download (UC-13).

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const WeeklyReport = sequelize.define('weekly_reports', {
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
  period_start: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  period_end: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  week_key: {
    type: DataTypes.STRING(16),
    allowNull: false,
  },
  summary: {
    type: DataTypes.TEXT('long'),
    allowNull: false,
  },
  metrics_snapshot: {
    type: DataTypes.JSON,
    allowNull: false,
  },
  recommendations: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  patterns: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  source_summary_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  notified_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  generated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'weekly_reports',
  timestamps: true,
  underscored: true,
  indexes: [
    { unique: true, fields: ['user_id', 'week_key'] },
    { fields: ['user_id', 'period_start', 'period_end'] },
  ],
});

module.exports = WeeklyReport;
