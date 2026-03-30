// server/migrations/20250208-001-initial-schema.js
// ============================================
// Initial Migration — Creates all LifeSync tables
// ============================================

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // --- 1. USERS TABLE ---
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      firebase_uid: {
        type: Sequelize.STRING(128),
        allowNull: true,
        unique: true,
      },
      username: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      verified_email: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      hashed_password: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      role: {
        type: Sequelize.ENUM('user', 'admin'),
        allowNull: false,
        defaultValue: 'user',
      },
      avatar_url: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      last_login_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      },
    });

    // --- 2. CATEGORIES TABLE ---
    await queryInterface.createTable('categories', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      domain: {
        type: Sequelize.ENUM('health', 'finance'),
        allowNull: false,
      },
      icon: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      color: {
        type: Sequelize.STRING(7),
        allowNull: true,
      },
      is_default: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('categories', ['domain']);
    await queryInterface.addIndex('categories', ['user_id']);

    // --- 3. HEALTH_LOGS TABLE ---
    await queryInterface.createTable('health_logs', {
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
      },
      category_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'categories', key: 'id' },
        onDelete: 'SET NULL',
      },
      type: {
        type: Sequelize.ENUM('steps', 'sleep', 'mood', 'nutrition', 'water', 'exercise', 'heart_rate'),
        allowNull: false,
      },
      value: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      value_text: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      unit: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      duration: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      logged_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      source: {
        type: Sequelize.ENUM('manual', 'nlp', 'google_fit', 'apple_health', 'api'),
        allowNull: false,
        defaultValue: 'nlp',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('health_logs', ['user_id', 'type', 'logged_at']);
    await queryInterface.addIndex('health_logs', ['user_id', 'logged_at']);

    // --- 4. FINANCIAL_LOGS TABLE ---
    await queryInterface.createTable('financial_logs', {
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
      },
      category_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'categories', key: 'id' },
        onDelete: 'SET NULL',
      },
      type: {
        type: Sequelize.ENUM('income', 'expense'),
        allowNull: false,
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD',
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      logged_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      source: {
        type: Sequelize.ENUM('manual', 'nlp', 'api'),
        allowNull: false,
        defaultValue: 'nlp',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('financial_logs', ['user_id', 'type', 'logged_at']);
    await queryInterface.addIndex('financial_logs', ['user_id', 'logged_at']);
    await queryInterface.addIndex('financial_logs', ['user_id', 'category_id']);

    // --- 5. LINKED_DOMAINS TABLE (Bridge) ---
    await queryInterface.createTable('linked_domains', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      health_log_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'health_logs', key: 'id' },
        onDelete: 'CASCADE',
      },
      financial_log_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'financial_logs', key: 'id' },
        onDelete: 'CASCADE',
      },
      source_message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      link_type: {
        type: Sequelize.ENUM('auto_nlp', 'manual'),
        allowNull: false,
        defaultValue: 'auto_nlp',
      },
      confidence: {
        type: Sequelize.DECIMAL(3, 2),
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
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('linked_domains', ['health_log_id']);
    await queryInterface.addIndex('linked_domains', ['financial_log_id']);
    await queryInterface.addIndex('linked_domains', ['health_log_id', 'financial_log_id'], { unique: true });

    // --- 6. AI_SUMMARIES TABLE ---
    await queryInterface.createTable('ai_summaries', {
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
      },
      type: {
        type: Sequelize.ENUM('health', 'finance', 'combined', 'behavioral'),
        allowNull: false,
      },
      period_start: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      period_end: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      summary: {
        type: Sequelize.TEXT('long'),
        allowNull: false,
      },
      patterns: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      recommendations: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      metrics_snapshot: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      is_read: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('ai_summaries', ['user_id', 'type']);
    await queryInterface.addIndex('ai_summaries', ['user_id', 'period_start', 'period_end']);

    // --- 7. CHAT_LOGS TABLE ---
    await queryInterface.createTable('chat_logs', {
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
      },
      session_id: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      role: {
        type: Sequelize.ENUM('user', 'assistant'),
        allowNull: false,
      },
      message: {
        type: Sequelize.TEXT('long'),
        allowNull: false,
      },
      intent: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      entities_json: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      processing_time_ms: {
        type: Sequelize.INTEGER,
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
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('chat_logs', ['user_id', 'session_id']);
    await queryInterface.addIndex('chat_logs', ['user_id', 'created_at']);
    await queryInterface.addIndex('chat_logs', ['intent']);

    // --- 8. USER_GOALS TABLE ---
    await queryInterface.createTable('user_goals', {
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
      },
      domain: {
        type: Sequelize.ENUM('health', 'finance'),
        allowNull: false,
      },
      metric_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      target_value: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      current_value: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      unit: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      period: {
        type: Sequelize.ENUM('daily', 'weekly', 'monthly'),
        allowNull: false,
        defaultValue: 'weekly',
      },
      start_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      end_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('active', 'completed', 'failed', 'paused'),
        allowNull: false,
        defaultValue: 'active',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('user_goals', ['user_id', 'status']);
    await queryInterface.addIndex('user_goals', ['user_id', 'domain']);

    // --- 9. SYSTEM_LOGS TABLE ---
    await queryInterface.createTable('system_logs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      admin_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      log_type: {
        type: Sequelize.ENUM('audit', 'error', 'performance', 'security', 'system'),
        allowNull: false,
      },
      action: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      target_table: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      target_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      details: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      severity: {
        type: Sequelize.ENUM('info', 'warning', 'error', 'critical'),
        allowNull: false,
        defaultValue: 'info',
      },
      ip_address: {
        type: Sequelize.STRING(45),
        allowNull: true,
      },
      user_agent: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      response_time_ms: {
        type: Sequelize.INTEGER,
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
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('system_logs', ['log_type', 'created_at']);
    await queryInterface.addIndex('system_logs', ['severity']);
    await queryInterface.addIndex('system_logs', ['admin_id']);
  },

  async down(queryInterface) {
    // Drop in reverse dependency order
    await queryInterface.dropTable('system_logs');
    await queryInterface.dropTable('user_goals');
    await queryInterface.dropTable('chat_logs');
    await queryInterface.dropTable('ai_summaries');
    await queryInterface.dropTable('linked_domains');
    await queryInterface.dropTable('financial_logs');
    await queryInterface.dropTable('health_logs');
    await queryInterface.dropTable('categories');
    await queryInterface.dropTable('users');
  },
};
