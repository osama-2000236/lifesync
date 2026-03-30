// server/models/SystemLog.js
// ============================================
// System Log Model
// Admin Monitoring: server health, user activity, audit trail
// ============================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SystemLog = sequelize.define('system_logs', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  admin_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL',
    comment: 'The admin who performed the action (null for system-generated)',
  },
  log_type: {
    type: DataTypes.ENUM('audit', 'error', 'performance', 'security', 'system'),
    allowNull: false,
    comment: 'Category of log entry',
  },
  action: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'What happened (e.g., user_login, api_error, nlp_timeout)',
  },
  target_table: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Which table was affected (if applicable)',
  },
  target_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'ID of the affected record',
  },
  details: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Additional structured details about the event',
  },
  severity: {
    type: DataTypes.ENUM('info', 'warning', 'error', 'critical'),
    allowNull: false,
    defaultValue: 'info',
  },
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: true,
    comment: 'Client IP address (supports IPv6)',
  },
  user_agent: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  response_time_ms: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Request processing time for performance logs',
  },
}, {
  tableName: 'system_logs',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['log_type', 'created_at'] },
    { fields: ['severity'] },
    { fields: ['action'] },
    { fields: ['admin_id'] },
  ],
});

module.exports = SystemLog;
