require('dotenv').config();

const db = require('../server/models');

const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;
const username = process.env.TEST_USERNAME || 'lifesync_qa';

if (!email || !password) {
  console.error('TEST_USER_EMAIL and TEST_USER_PASSWORD are required.');
  process.exit(1);
}

const provision = async () => {
  try {
    await db.sequelize.authenticate();
    const [user, created] = await db.User.findOrCreate({
      where: { email },
      defaults: {
        username,
        hashed_password: password,
        name: 'LifeSync QA',
        role: 'user',
        verified_email: true,
        is_active: true,
      },
    });

    if (!created) {
      await user.update({
        hashed_password: password,
        verified_email: true,
        is_active: true,
      });
    }

    console.log(`QA user ${created ? 'created' : 'refreshed'}: ${email}`);
  } finally {
    await db.sequelize.close();
  }
};

provision().catch((error) => {
  console.error(`QA provisioning failed: ${error.message}`);
  process.exitCode = 1;
});
