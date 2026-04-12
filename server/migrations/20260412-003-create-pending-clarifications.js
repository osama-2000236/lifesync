// server/migrations/20260412-003-create-pending-clarifications.js
// ============================================
// Creates the pending_clarifications table.
// Replaces the in-memory Map used in chatController.js so clarification
// state survives server restarts and multi-instance deployments.
// ============================================

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('pending_clarifications', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      session_id: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      original_message: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      clarification_question: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      clarification_options: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('pending_clarifications', ['expires_at']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('pending_clarifications');
  },
};
