'use strict';

// ============================================
// Migration 005 — user_integrations
// ============================================
// Durable per-user OAuth tokens for external health platforms. Previously an
// in-memory Map in externalRoutes — every deploy or restart disconnected
// every user. Token fields hold AES ciphertext (model hooks encrypt at rest).
// ============================================

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const normalized = tables.map((t) => (typeof t === 'string' ? t : t.tableName));
    if (!normalized.includes('user_integrations')) {
      await queryInterface.createTable('user_integrations', {
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
        platform: {
          type: Sequelize.STRING(40),
          allowNull: false,
        },
        access_token: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        refresh_token: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        expires_in: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        connected_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
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

      await queryInterface.addIndex('user_integrations', ['user_id', 'platform'], {
        unique: true,
        name: 'user_integrations_user_id_platform',
      });
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const normalized = tables.map((t) => (typeof t === 'string' ? t : t.tableName));
    if (normalized.includes('user_integrations')) {
      await queryInterface.dropTable('user_integrations');
    }
  },
};
