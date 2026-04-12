// server/models/PendingClarification.js
// ============================================
// Persistent storage for mid-flow clarification state.
// Replaces the in-memory Map so server restarts / multi-instance
// deployments don't lose pending user clarifications.
// One row per user (unique on user_id); upserted on each clarification.
// ============================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PendingClarification = sequelize.define('pending_clarifications', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE',
  },
  session_id: {
    type: DataTypes.STRING(128),
    allowNull: false,
  },
  original_message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  clarification_question: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  clarification_options: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Row is ignored (not deleted) after this timestamp — 5-minute TTL',
  },
}, {
  tableName: 'pending_clarifications',
  timestamps: true,
  underscored: true,
  indexes: [
    { unique: true, fields: ['user_id'] },
    { fields: ['expires_at'] },
  ],
});

module.exports = PendingClarification;
