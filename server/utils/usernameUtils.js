const crypto = require('crypto');

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 50;
const USERNAME_BASE_MAX_LENGTH = 42;

const normalizeUsername = (value) => {
  const sanitized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

  if (!sanitized) {
    return 'user';
  }

  if (sanitized.length >= USERNAME_MIN_LENGTH) {
    return sanitized.slice(0, USERNAME_MAX_LENGTH);
  }

  return `${sanitized}${'user'.slice(0, USERNAME_MIN_LENGTH - sanitized.length)}`;
};

const buildUsernameBase = ({ email, name }) => {
  const localPart = String(email || '').split('@')[0];

  return normalizeUsername(name || localPart || 'user').slice(0, USERNAME_BASE_MAX_LENGTH);
};

const generateUniqueUsername = async (UserModel, profile) => {
  const base = buildUsernameBase(profile);

  for (let suffix = 0; suffix < 20; suffix += 1) {
    const candidate = suffix === 0
      ? base
      : `${base.slice(0, USERNAME_MAX_LENGTH - `${suffix}`.length - 1)}_${suffix}`;

    // eslint-disable-next-line no-await-in-loop
    const existingUser = await UserModel.findOne({ where: { username: candidate } });
    if (!existingUser) {
      return candidate;
    }
  }

  return `${base.slice(0, 41)}_${crypto.randomInt(100000, 999999)}`;
};

module.exports = {
  normalizeUsername,
  buildUsernameBase,
  generateUniqueUsername,
};
