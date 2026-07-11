'use strict';

// ============================================
// Migration 006 — weekly reports + notifications
// ============================================
// UC-13: immutable weekly report snapshots (PDF rendered on download).
// UC-14: in-app (+ optional email) notifications when a report is ready.
// ============================================

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const normalized = tables.map((t) => (typeof t === 'string' ? t : t.tableName || t.name));

    // User preference columns for report notifications.
    const userDesc = await queryInterface.describeTable('users');
    if (!userDesc.report_notify_enabled) {
      await queryInterface.addColumn('users', 'report_notify_enabled', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }
    if (!userDesc.timezone) {
      await queryInterface.addColumn('users', 'timezone', {
        type: Sequelize.STRING(64),
        allowNull: false,
        defaultValue: 'UTC',
      });
    }

    if (!normalized.includes('weekly_reports')) {
      await queryInterface.createTable('weekly_reports', {
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
        period_start: {
          type: Sequelize.DATEONLY,
          allowNull: false,
        },
        period_end: {
          type: Sequelize.DATEONLY,
          allowNull: false,
        },
        week_key: {
          type: Sequelize.STRING(16),
          allowNull: false,
          comment: 'ISO year-week e.g. 2026-W28 for idempotent generation',
        },
        summary: {
          type: Sequelize.TEXT('long'),
          allowNull: false,
        },
        metrics_snapshot: {
          type: Sequelize.JSON,
          allowNull: false,
        },
        recommendations: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        patterns: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        source_summary_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'ai_summaries', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        },
        notified_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        generated_at: {
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
      await queryInterface.addIndex('weekly_reports', ['user_id', 'week_key'], {
        unique: true,
        name: 'weekly_reports_user_week_unique',
      });
      await queryInterface.addIndex('weekly_reports', ['user_id', 'period_start', 'period_end']);
    }

    if (!normalized.includes('user_notifications')) {
      await queryInterface.createTable('user_notifications', {
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
        type: {
          type: Sequelize.STRING(40),
          allowNull: false,
          defaultValue: 'weekly_report',
        },
        title: {
          type: Sequelize.STRING(200),
          allowNull: false,
        },
        body: {
          type: Sequelize.TEXT,
          allowNull: false,
        },
        link: {
          type: Sequelize.STRING(500),
          allowNull: true,
        },
        meta: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        read_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        email_sent_at: {
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
      await queryInterface.addIndex('user_notifications', ['user_id', 'created_at']);
      await queryInterface.addIndex('user_notifications', ['user_id', 'read_at']);
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const normalized = tables.map((t) => (typeof t === 'string' ? t : t.tableName || t.name));
    if (normalized.includes('user_notifications')) {
      await queryInterface.dropTable('user_notifications');
    }
    if (normalized.includes('weekly_reports')) {
      await queryInterface.dropTable('weekly_reports');
    }
    const userDesc = await queryInterface.describeTable('users');
    if (userDesc.report_notify_enabled) {
      await queryInterface.removeColumn('users', 'report_notify_enabled');
    }
    if (userDesc.timezone) {
      await queryInterface.removeColumn('users', 'timezone');
    }
  },
};
