// server/models/Category.js
// ============================================
// Category Model
// Supports both default system categories and user-created custom ones
// ============================================

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Category = sequelize.define('categories', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  domain: {
    type: DataTypes.ENUM('health', 'finance'),
    allowNull: false,
    comment: 'Which domain this category belongs to',
  },
  icon: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Icon identifier (e.g., emoji or icon library key)',
  },
  color: {
    type: DataTypes.STRING(7),
    allowNull: true,
    comment: 'Hex color code for UI display (e.g., #4CAF50)',
  },
  is_default: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'True for system-seeded categories',
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE',
    comment: 'NULL for default categories; set for user-created custom ones',
  },
}, {
  tableName: 'categories',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['domain'] },
    { fields: ['user_id'] },
    { fields: ['is_default'] },
  ],
});

module.exports = Category;
