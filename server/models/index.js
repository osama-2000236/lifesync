// server/models/index.js
// ============================================
// Model Registry & Association Setup
// Auto-loads all models and configures relationships
// ============================================

const { sequelize } = require('../config/database');
const User = require('./User');
const HealthLog = require('./HealthLog');
const FinancialLog = require('./FinancialLog');
const Category = require('./Category');
const AISummary = require('./AISummary');
const ChatLog = require('./ChatLog');
const UserGoal = require('./UserGoal');
const LinkedDomain = require('./LinkedDomain');
const SystemLog = require('./SystemLog');
const UserMemory = require('./UserMemory');
const UserIntegration = require('./UserIntegration');

// Association FK options must match migration / column onDelete so Sequelize
// cascade helpers and schema docs stay aligned with the real DB constraints.
const CASCADE = { onDelete: 'CASCADE', onUpdate: 'CASCADE' };
const SET_NULL = { onDelete: 'SET NULL', onUpdate: 'CASCADE' };

// ============================================
// ASSOCIATIONS
// ============================================

// --- User Associations ---
User.hasMany(HealthLog, { foreignKey: 'user_id', as: 'healthLogs', ...CASCADE });
User.hasMany(FinancialLog, { foreignKey: 'user_id', as: 'financialLogs', ...CASCADE });
User.hasMany(Category, { foreignKey: 'user_id', as: 'customCategories', ...CASCADE });
User.hasMany(AISummary, { foreignKey: 'user_id', as: 'aiSummaries', ...CASCADE });
User.hasMany(ChatLog, { foreignKey: 'user_id', as: 'chatLogs', ...CASCADE });
User.hasMany(UserGoal, { foreignKey: 'user_id', as: 'goals', ...CASCADE });
User.hasMany(SystemLog, { foreignKey: 'admin_id', as: 'adminLogs', ...SET_NULL });
User.hasMany(UserMemory, { foreignKey: 'user_id', as: 'memories', ...CASCADE });
User.hasMany(UserIntegration, { foreignKey: 'user_id', as: 'integrations', ...CASCADE });

// --- HealthLog Associations ---
HealthLog.belongsTo(User, { foreignKey: 'user_id', as: 'user', ...CASCADE });
HealthLog.belongsTo(Category, { foreignKey: 'category_id', as: 'category', ...SET_NULL });
HealthLog.hasMany(LinkedDomain, { foreignKey: 'health_log_id', as: 'linkedEntries', ...CASCADE });

// --- FinancialLog Associations ---
FinancialLog.belongsTo(User, { foreignKey: 'user_id', as: 'user', ...CASCADE });
FinancialLog.belongsTo(Category, { foreignKey: 'category_id', as: 'category', ...SET_NULL });
FinancialLog.hasMany(LinkedDomain, { foreignKey: 'financial_log_id', as: 'linkedEntries', ...CASCADE });

// --- Category Associations ---
Category.belongsTo(User, { foreignKey: 'user_id', as: 'owner', ...CASCADE });
Category.hasMany(HealthLog, { foreignKey: 'category_id', as: 'healthLogs', ...SET_NULL });
Category.hasMany(FinancialLog, { foreignKey: 'category_id', as: 'financialLogs', ...SET_NULL });

// --- AISummary Associations ---
AISummary.belongsTo(User, { foreignKey: 'user_id', as: 'user', ...CASCADE });

// --- ChatLog Associations ---
ChatLog.belongsTo(User, { foreignKey: 'user_id', as: 'user', ...CASCADE });

// --- UserGoal Associations ---
UserGoal.belongsTo(User, { foreignKey: 'user_id', as: 'user', ...CASCADE });

// --- LinkedDomain Bridge Associations ---
LinkedDomain.belongsTo(HealthLog, { foreignKey: 'health_log_id', as: 'healthLog', ...CASCADE });
LinkedDomain.belongsTo(FinancialLog, { foreignKey: 'financial_log_id', as: 'financialLog', ...CASCADE });

// --- SystemLog Associations ---
SystemLog.belongsTo(User, { foreignKey: 'admin_id', as: 'admin', ...SET_NULL });

// --- UserMemory Associations ---
UserMemory.belongsTo(User, { foreignKey: 'user_id', as: 'user', ...CASCADE });

// --- UserIntegration Associations ---
UserIntegration.belongsTo(User, { foreignKey: 'user_id', as: 'user', ...CASCADE });

// ============================================
// Export all models
// ============================================
const db = {
  sequelize,
  User,
  HealthLog,
  FinancialLog,
  Category,
  AISummary,
  ChatLog,
  UserGoal,
  LinkedDomain,
  SystemLog,
  UserMemory,
  UserIntegration,
};

module.exports = db;
