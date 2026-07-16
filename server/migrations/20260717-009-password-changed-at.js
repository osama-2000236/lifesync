'use strict';

// Token revocation on password change (P6). Stateless JWTs otherwise outlive a
// password reset — a stolen 30-day refresh token kept working after the victim
// changed their password. Tokens issued before this timestamp are rejected.

module.exports = {
  async up(queryInterface, Sequelize) {
    const desc = await queryInterface.describeTable('users');
    if (!desc.password_changed_at) {
      await queryInterface.addColumn('users', 'password_changed_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'JWTs issued before this moment are invalid (UTC)',
      });
    }
  },

  async down(queryInterface) {
    const desc = await queryInterface.describeTable('users');
    if (desc.password_changed_at) {
      await queryInterface.removeColumn('users', 'password_changed_at');
    }
  },
};
