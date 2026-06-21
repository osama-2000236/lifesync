// server/models/Notification.js
// ============================================
// Notification Model — UR9
// Weekly-summary alerts, insight-ready alerts, reminders.
// ============================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Notification = sequelize.define('notifications', {
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
    type: DataTypes.ENUM('insight', 'report', 'reminder', 'system'),
    allowNull: false,
    defaultValue: 'system',
  },
  title: {
    type: DataTypes.STRING(160),
    allowNull: false,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  link: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'In-app route to open when the notification is clicked (e.g. /dashboard)',
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  is_read: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
}, {
  tableName: 'notifications',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id', 'is_read'] },
    { fields: ['user_id', 'created_at'] },
  ],
});

module.exports = Notification;
