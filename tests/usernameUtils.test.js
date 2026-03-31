const {
  normalizeUsername,
  buildUsernameBase,
  generateUniqueUsername,
} = require('../server/utils/usernameUtils');

describe('usernameUtils', () => {
  test('normalizeUsername keeps only lowercase letters, numbers, and underscores', () => {
    expect(normalizeUsername('John Doe! 2026')).toBe('john_doe_2026');
  });

  test('buildUsernameBase prefers the name when available', () => {
    expect(buildUsernameBase({
      name: 'Osama Khaled',
      email: 'ok@example.com',
    })).toBe('osama_khaled');
  });

  test('buildUsernameBase falls back to email local-part', () => {
    expect(buildUsernameBase({
      email: 'lifesync.user@example.com',
    })).toBe('lifesync_user');
  });

  test('generateUniqueUsername appends suffixes for collisions', async () => {
    const findOne = jest.fn()
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ id: 2 })
      .mockResolvedValueOnce(null);

    const username = await generateUniqueUsername({ findOne }, {
      name: 'Life Sync',
      email: 'lifesync@example.com',
    });

    expect(username).toBe('life_sync_2');
    expect(findOne).toHaveBeenCalledTimes(3);
  });
});
