'use strict';

// Absolute access-token expiry for external integrations (UC-15).
// Using connected_at + expires_in is wrong after a refresh that only updates
// the access token — expires_at is the wall-clock deadline.

module.exports = {
  async up(queryInterface, Sequelize) {
    const desc = await queryInterface.describeTable('user_integrations');
    if (!desc.token_expires_at) {
      await queryInterface.addColumn('user_integrations', 'token_expires_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When access_token is expected to expire (UTC)',
      });
    }
  },

  async down(queryInterface) {
    const desc = await queryInterface.describeTable('user_integrations');
    if (desc.token_expires_at) {
      await queryInterface.removeColumn('user_integrations', 'token_expires_at');
    }
  },
};
