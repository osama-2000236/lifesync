'use strict';

// health_logs.value_text is AES-encrypted at rest. CryptoJS ciphertext for a
// ~180-char plaintext is ~280 chars — exceeds VARCHAR(255) on MySQL.
//
// SQLite: VARCHAR length is not enforced (TEXT affinity). Sequelize's
// changeColumn rebuilds the table and DROPS ON DELETE CASCADE from FKs
// (verified via PRAGMA foreign_key_list). Never changeColumn on SQLite.

module.exports = {
  async up(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === 'sqlite') return;

    const table = await queryInterface.describeTable('health_logs');
    if (!table.value_text) return;

    const t = String(table.value_text.type || '').toLowerCase();
    // Already TEXT / LONGTEXT — nothing to do
    if (t.includes('text') && !t.includes('varchar') && !t.includes('character varying')) {
      return;
    }

    await queryInterface.changeColumn('health_logs', 'value_text', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === 'sqlite') return;

    const table = await queryInterface.describeTable('health_logs');
    if (!table.value_text) return;

    await queryInterface.changeColumn('health_logs', 'value_text', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  },
};
