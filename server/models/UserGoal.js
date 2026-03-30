// server/models/UserGoal.js
// ============================================
// User Goal Model
// Personal targets for health and finance metrics
// ============================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserGoal = sequelize.define('user_goals', {
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
  domain: {
    type: DataTypes.ENUM('health', 'finance'),
    allowNull: false,
  },
  metric_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'e.g., steps, sleep, spending_food, savings',
  },
  target_value: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  current_value: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },
  unit: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  period: {
    type: DataTypes.ENUM('daily', 'weekly', 'monthly'),
    allowNull: false,
    defaultValue: 'weekly',
  },
  start_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  end_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('active', 'completed', 'failed', 'paused'),
    allowNull: false,
    defaultValue: 'active',
  },
}, {
  tableName: 'user_goals',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id', 'status'] },
    { fields: ['user_id', 'domain'] },
  ],
});

module.exports = UserGoal;
