// server/models/Report.js
// ============================================
// Report Model — UR12
// Stored weekly/period reports the user can view and download
// (JSON / CSV / printable HTML).
// ============================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Report = sequelize.define('reports', {
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
    type: DataTypes.ENUM('weekly', 'monthly', 'custom'),
    allowNull: false,
    defaultValue: 'weekly',
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  period_start: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  period_end: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  content: {
    type: DataTypes.JSON,
    allowNull: false,
    comment: 'Structured report payload: summary, scores, health/finance tables, recommendations',
  },
  generated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'reports',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id', 'generated_at'] },
    { fields: ['user_id', 'type'] },
  ],
});

module.exports = Report;
