'use strict';

// users.avatar_url was VARCHAR(500) — too small for data: URLs, so profile
// photos lived in device localStorage. Widen to TEXT so the client's
// compressed (256px JPEG) data URL fits and avatars survive across devices.
//
// SQLite: VARCHAR length is not enforced (TEXT affinity), and changeColumn
// on SQLite rebuilds the table dropping FK cascades — never changeColumn there.

module.exports = {
  async up(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === 'sqlite') return;

    const table = await queryInterface.describeTable('users');
    if (!table.avatar_url) return;

    const t = String(table.avatar_url.type || '').toLowerCase();
    if (t.includes('text') && !t.includes('varchar') && !t.includes('character varying')) {
      return;
    }

    await queryInterface.changeColumn('users', 'avatar_url', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === 'sqlite') return;

    const table = await queryInterface.describeTable('users');
    if (!table.avatar_url) return;

    await queryInterface.changeColumn('users', 'avatar_url', {
      type: Sequelize.STRING(500),
      allowNull: true,
    });
  },
};
