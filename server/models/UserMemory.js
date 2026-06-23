// server/models/UserMemory.js
// ============================================
// User Memory Model
// ============================================
// Durable, model-agnostic facts the assistant remembers about a user
// (name, preferences, routines, recurring commute, goals, etc.).
//
// Memory lives in the application database, NOT inside any AI model. That is
// what makes it transferable: when the user switches the active model
// (BERT → Gemma → custom), the same memory is injected into the new model's
// context, exactly like a chat assistant that "remembers you" regardless of
// which model is generating the reply.
// ============================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserMemory = sequelize.define('user_memories', {
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
  // Stable lookup key, e.g. "name", "vehicle.primary", "routine.commute",
  // "pref.coffee". `key` is reserved in MySQL, so the column is mem_key.
  mem_key: {
    type: DataTypes.STRING(120),
    allowNull: false,
    comment: 'Stable key used to upsert a fact (e.g. vehicle.primary).',
  },
  category: {
    type: DataTypes.ENUM('profile', 'preference', 'routine', 'health', 'finance', 'goal', 'other'),
    allowNull: false,
    defaultValue: 'other',
  },
  value: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Human-readable fact, e.g. "commutes to town by car".',
  },
  confidence: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0.7,
  },
  source: {
    type: DataTypes.ENUM('chat', 'system', 'user'),
    allowNull: false,
    defaultValue: 'chat',
    comment: 'Where the fact came from: inferred from chat, system, or user-edited.',
  },
  // Higher salience = more important to surface in context.
  salience: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
  times_seen: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    comment: 'How many times this fact has been reinforced by the user.',
  },
  last_seen_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'user_memories',
  timestamps: true,
  underscored: true,
  indexes: [
    { unique: true, fields: ['user_id', 'mem_key'] },
    { fields: ['user_id', 'salience'] },
  ],
});

module.exports = UserMemory;
