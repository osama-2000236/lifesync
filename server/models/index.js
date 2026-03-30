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

// ============================================
// ASSOCIATIONS
// ============================================

// --- User Associations ---
User.hasMany(HealthLog, { foreignKey: 'user_id', as: 'healthLogs' });
User.hasMany(FinancialLog, { foreignKey: 'user_id', as: 'financialLogs' });
User.hasMany(Category, { foreignKey: 'user_id', as: 'customCategories' });
User.hasMany(AISummary, { foreignKey: 'user_id', as: 'aiSummaries' });
User.hasMany(ChatLog, { foreignKey: 'user_id', as: 'chatLogs' });
User.hasMany(UserGoal, { foreignKey: 'user_id', as: 'goals' });
User.hasMany(SystemLog, { foreignKey: 'admin_id', as: 'adminLogs' });

// --- HealthLog Associations ---
HealthLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
HealthLog.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });
HealthLog.hasMany(LinkedDomain, { foreignKey: 'health_log_id', as: 'linkedEntries' });

// --- FinancialLog Associations ---
FinancialLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
FinancialLog.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });
FinancialLog.hasMany(LinkedDomain, { foreignKey: 'financial_log_id', as: 'linkedEntries' });

// --- Category Associations ---
Category.belongsTo(User, { foreignKey: 'user_id', as: 'owner' });
Category.hasMany(HealthLog, { foreignKey: 'category_id', as: 'healthLogs' });
Category.hasMany(FinancialLog, { foreignKey: 'category_id', as: 'financialLogs' });

// --- AISummary Associations ---
AISummary.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// --- ChatLog Associations ---
ChatLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// --- UserGoal Associations ---
UserGoal.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// --- LinkedDomain Bridge Associations ---
LinkedDomain.belongsTo(HealthLog, { foreignKey: 'health_log_id', as: 'healthLog' });
LinkedDomain.belongsTo(FinancialLog, { foreignKey: 'financial_log_id', as: 'financialLog' });

// --- SystemLog Associations ---
SystemLog.belongsTo(User, { foreignKey: 'admin_id', as: 'admin' });

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
};

module.exports = db;
