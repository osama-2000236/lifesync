// server/models/ChatLog.js
// ============================================
// Chat Log Model (MySQL Mirror)
// Mirrors Firebase chat data for analytical queries
// ============================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ChatLog = sequelize.define('chat_logs', {
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
  session_id: {
    type: DataTypes.STRING(128),
    allowNull: false,
    comment: 'Maps to Firebase chat_sessions/{session_id}',
  },
  role: {
    type: DataTypes.ENUM('user', 'assistant'),
    allowNull: false,
  },
  message: {
    type: DataTypes.TEXT('long'),
    allowNull: false,
  },
  intent: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'NLP-extracted intent (e.g., log_expense, log_health, query_data)',
  },
  entities_json: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'NLP-extracted entities as JSON',
  },
  processing_time_ms: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'How long the NLP processing took in milliseconds',
  },
  status: {
    type: DataTypes.ENUM('sent', 'pending', 'complete', 'error'),
    allowNull: false,
    defaultValue: 'complete',
    comment: 'Message lifecycle: sent (user msg logged), pending (awaiting AI), complete, error',
  },
}, {
  tableName: 'chat_logs',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id', 'session_id'] },
    { fields: ['user_id', 'created_at'] },
    { fields: ['intent'] },
  ],
});

module.exports = ChatLog;
