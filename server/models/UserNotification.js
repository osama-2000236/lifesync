// server/models/UserNotification.js
// In-app notifications (UC-14) — report ready, etc.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserNotification = sequelize.define('user_notifications', {
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
    type: DataTypes.STRING(40),
    allowNull: false,
    defaultValue: 'weekly_report',
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  link: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  meta: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  read_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  email_sent_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'user_notifications',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id', 'created_at'] },
    { fields: ['user_id', 'read_at'] },
  ],
});

module.exports = UserNotification;
