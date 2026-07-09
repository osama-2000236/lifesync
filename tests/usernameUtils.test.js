const {
  normalizeUsername,
  buildUsernameBase,
  generateUniqueUsername,
} = require('../server/utils/usernameUtils');

describe('usernameUtils', () => {
  test('normalizeUsername keeps only lowercase letters, numbers, and underscores', () => {
    expect(normalizeUsername('John Doe! 2026')).toBe('john_doe_2026');
  });

  test('strips unicode/emoji and never empty', () => {
    expect(normalizeUsername('😀😀😀')).toBe('user');
    expect(normalizeUsername('José')).toBe('jos');
    expect(normalizeUsername('')).toBe('user');
    expect(normalizeUsername(null)).toBe('user');
  });

  test('enforces max length 50', () => {
    const long = normalizeUsername(`A${'b'.repeat(100)}`);
    expect(long.length).toBeLessThanOrEqual(50);
    expect(long).toMatch(/^[a-z0-9_]+$/);
  });

  test('rejects SQL-looking injection characters (sanitized away)', () => {
    expect(normalizeUsername("admin'; DROP TABLE users;--")).toBe('admin_drop_table_users');
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
    expect(username.length).toBeLessThanOrEqual(50);
    expect(findOne).toHaveBeenCalledTimes(3);
  });

  test('generateUniqueUsername falls back to random when all suffixes taken', async () => {
    const findOne = jest.fn().mockResolvedValue({ id: 1 });
    const username = await generateUniqueUsername({ findOne }, {
      name: 'Taken',
      email: 't@x.com',
    });
    expect(username).toMatch(/^taken_\d{6}$/);
    expect(username.length).toBeLessThanOrEqual(50);
  });
});

