// server/seeders/seed.js
// ============================================
// Database Seeder
// Creates default categories and an admin user
// Run: node server/seeders/seed.js
// ============================================

require('dotenv').config();
const { Op } = require('sequelize');
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

    // Seed categories — upsert by (name, domain) so re-seed is idempotent
    // even when only a partial default set exists.
    let createdCats = 0;
    for (const cat of defaultCategories) {
      const [row, created] = await db.Category.findOrCreate({
        where: { name: cat.name, domain: cat.domain, is_default: true },
        defaults: { ...cat, user_id: null },
      });
      if (created) createdCats += 1;
      void row;
    }
    if (createdCats > 0) {
      console.log(`✅ Seeded ${createdCats} default categories (${defaultCategories.length} total defaults).`);
    } else {
      console.log(`⏭️  Default categories already exist. Skipping.`);
    }

    // Seed admin user (skip if already exists by role or username/email)
    const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@lifesync.app';
    const existingAdmin = await db.User.findOne({
      where: {
        [Op.or]: [
          { role: 'admin' },
          { username: 'admin' },
          { email: adminEmail },
        ],
      },
    });
    if (existingAdmin) {
      console.log('⏭️  Admin user already exists. Skipping.');
    } else {
      const adminPassword = process.env.SEED_ADMIN_PASSWORD;
      const isProduction = process.env.NODE_ENV === 'production';

      // In production, refuse to create an admin with the built-in known
      // password. Require explicit credentials via env instead.
      if (isProduction && (!process.env.SEED_ADMIN_EMAIL || !adminPassword)) {
        console.warn(
          '⚠️  Skipping admin seed: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD ' +
          'to create the initial admin in production. Refusing to seed a default ' +
          'admin with a known password.'
        );
      } else {
        const password = adminPassword || 'Admin@123456';

        if (!adminPassword) {
          console.warn(
            '⚠️  Seeding admin with the built-in development password. Override ' +
            'with SEED_ADMIN_PASSWORD before any shared or deployed instance.'
          );
        }

        await db.User.create({
          username: 'admin',
          email: adminEmail,
          hashed_password: password, // Will be hashed by beforeCreate hook
          name: 'System Admin',
          role: 'admin',
          verified_email: true,
          is_active: true,
        });
        console.log(`✅ Seeded admin user (${adminEmail}).`);
      }
    }

    console.log('\n🎉 Seeding complete!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

seed();
