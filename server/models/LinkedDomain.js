// server/models/LinkedDomain.js
// ============================================
// Linked Domain Bridge Table
// Links health and finance records that originated
// from the same user input (e.g., "Spent $50 on a healthy dinner")
// ============================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LinkedDomain = sequelize.define('linked_domains', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  health_log_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'health_logs', key: 'id' },
    onDelete: 'CASCADE',
    comment: 'Reference to the health log entry',
  },
  financial_log_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'financial_logs', key: 'id' },
    onDelete: 'CASCADE',
    comment: 'Reference to the financial log entry',
  },
  source_message: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'The original NLP message that produced both entries',
  },
  link_type: {
    type: DataTypes.ENUM('auto_nlp', 'manual'),
    allowNull: false,
    defaultValue: 'auto_nlp',
    comment: 'How this link was created',
  },
  confidence: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: true,
    comment: 'NLP confidence score for the cross-domain link (0.00 - 1.00)',
  },
}, {
  tableName: 'linked_domains',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['health_log_id'] },
    { fields: ['financial_log_id'] },
    { fields: ['health_log_id', 'financial_log_id'], unique: true },
  ],
});

module.exports = LinkedDomain;
