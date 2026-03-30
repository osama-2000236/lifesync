// server/seeders/seed.js
// ============================================
// Database Seeder
// Creates default categories and an admin user
// Run: node server/seeders/seed.js
// ============================================

require('dotenv').config();
const db = require('../models');

const defaultCategories = [
  // Health categories
  { name: 'Steps', domain: 'health', icon: '🚶', color: '#4CAF50', is_default: true },
  { name: 'Sleep', domain: 'health', icon: '😴', color: '#3F51B5', is_default: true },
  { name: 'Mood', domain: 'health', icon: '😊', color: '#FF9800', is_default: true },
  { name: 'Nutrition', domain: 'health', icon: '🥗', color: '#8BC34A', is_default: true },
  { name: 'Water Intake', domain: 'health', icon: '💧', color: '#03A9F4', is_default: true },
  { name: 'Exercise', domain: 'health', icon: '🏋️', color: '#E91E63', is_default: true },
  { name: 'Heart Rate', domain: 'health', icon: '❤️', color: '#F44336', is_default: true },

  // Finance categories
  { name: 'Food & Dining', domain: 'finance', icon: '🍽️', color: '#FF5722', is_default: true },
  { name: 'Transportation', domain: 'finance', icon: '🚗', color: '#607D8B', is_default: true },
  { name: 'Entertainment', domain: 'finance', icon: '🎬', color: '#9C27B0', is_default: true },
  { name: 'Shopping', domain: 'finance', icon: '🛍️', color: '#E91E63', is_default: true },
  { name: 'Bills & Utilities', domain: 'finance', icon: '📄', color: '#795548', is_default: true },
  { name: 'Healthcare', domain: 'finance', icon: '🏥', color: '#00BCD4', is_default: true },
  { name: 'Education', domain: 'finance', icon: '📚', color: '#FF9800', is_default: true },
  { name: 'Groceries', domain: 'finance', icon: '🛒', color: '#4CAF50', is_default: true },
  { name: 'Income - Salary', domain: 'finance', icon: '💰', color: '#2E7D32', is_default: true },
  { name: 'Income - Freelance', domain: 'finance', icon: '💻', color: '#1565C0', is_default: true },
  { name: 'Savings', domain: 'finance', icon: '🏦', color: '#FFC107', is_default: true },
];

const seed = async () => {
  try {
    // Connect and sync
    await db.sequelize.authenticate();
    console.log('✅ Database connected.');

    await db.sequelize.sync({ force: false });
    console.log('✅ Tables synced.');

    // Seed categories (skip if already exist)
    const existingCategories = await db.Category.count({ where: { is_default: true } });
    if (existingCategories === 0) {
      await db.Category.bulkCreate(defaultCategories);
      console.log(`✅ Seeded ${defaultCategories.length} default categories.`);
    } else {
      console.log(`⏭️  Default categories already exist (${existingCategories} found). Skipping.`);
    }

    // Seed admin user (skip if already exists)
    const existingAdmin = await db.User.findOne({ where: { role: 'admin' } });
    if (!existingAdmin) {
      await db.User.create({
        username: 'admin',
        email: 'admin@lifesync.app',
        hashed_password: 'Admin@123456', // Will be hashed by beforeCreate hook
        name: 'System Admin',
        role: 'admin',
        verified_email: true,
        is_active: true,
      });
      console.log('✅ Seeded admin user (admin@lifesync.app / Admin@123456).');
    } else {
      console.log('⏭️  Admin user already exists. Skipping.');
    }

    console.log('\n🎉 Seeding complete!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

seed();
