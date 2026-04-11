'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('chat_logs', 'status', {
      type: Sequelize.ENUM('sent', 'pending', 'complete', 'error'),
      allowNull: false,
      defaultValue: 'complete',
      comment: 'Message lifecycle: sent (user msg logged), pending (awaiting AI), complete, error',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('chat_logs', 'status');
  },
};
