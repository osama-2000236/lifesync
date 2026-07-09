'use strict';

// ============================================
// Migration 003 — User memory + preferred model
// ============================================
// 1. Adds users.preferred_model so the user's chosen model (BERT default,
//    Gemma 3/4, or a custom model) is remembered across sessions.
// 2. Creates user_memories: durable, model-agnostic facts the assistant
//    remembers about the user. Stored in the app DB so memory transfers
//    automatically when the active model changes.
// ============================================

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('users');
    if (!table.preferred_model) {
      await queryInterface.addColumn('users', 'preferred_model', {
        type: Sequelize.STRING(60),
        allowNull: false,
        defaultValue: 'bert_local',
        comment: 'Model the user picked at signup / in settings.',
      });
    }

    const tables = await queryInterface.showAllTables();
    const normalized = tables.map((t) => (typeof t === 'string' ? t : t.tableName));
    if (!normalized.includes('user_memories')) {
      await queryInterface.createTable('user_memories', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        mem_key: {
          type: Sequelize.STRING(120),
          allowNull: false,
        },
        category: {
          type: Sequelize.ENUM('profile', 'preference', 'routine', 'health', 'finance', 'goal', 'other'),
          allowNull: false,
          defaultValue: 'other',
        },
        value: {
          type: Sequelize.TEXT,
          allowNull: false,
        },
        confidence: {
          type: Sequelize.FLOAT,
          allowNull: false,
          defaultValue: 0.7,
        },
        source: {
          type: Sequelize.ENUM('chat', 'system', 'user'),
          allowNull: false,
          defaultValue: 'chat',
        },
        salience: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
        },
        times_seen: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
        },
        last_seen_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      });

      await queryInterface.addIndex('user_memories', ['user_id', 'mem_key'], {
        unique: true,
        name: 'user_memories_user_id_mem_key',
      });
      await queryInterface.addIndex('user_memories', ['user_id', 'salience'], {
        name: 'user_memories_user_id_salience',
      });
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const normalized = tables.map((t) => (typeof t === 'string' ? t : t.tableName));
    if (normalized.includes('user_memories')) {
      await queryInterface.dropTable('user_memories');
    }
    const table = await queryInterface.describeTable('users');
    if (table.preferred_model) {
      await queryInterface.removeColumn('users', 'preferred_model');
    }
  },
};
