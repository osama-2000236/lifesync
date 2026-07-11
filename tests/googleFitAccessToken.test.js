// Unit: access-token validity helper used by UC-15 sync path

const { _accessTokenStillValid: accessTokenStillValid } = require('../server/routes/externalRoutes');

describe('accessTokenStillValid', () => {
  test('false when missing token', () => {
    expect(accessTokenStillValid(null)).toBe(false);
    expect(accessTokenStillValid({})).toBe(false);
  });

  test('true when token_expires_at is in the future', () => {
    expect(accessTokenStillValid({
      accessToken: 'x',
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })).toBe(true);
  });

  test('false when token_expires_at is imminent/past', () => {
    expect(accessTokenStillValid({
      accessToken: 'x',
      tokenExpiresAt: new Date(Date.now() + 30_000), // < 2 min buffer
    })).toBe(false);
  });

  test('legacy connectedAt + expiresIn still works', () => {
    expect(accessTokenStillValid({
      accessToken: 'x',
      connectedAt: new Date(Date.now() - 1000),
      expiresIn: 3600,
    })).toBe(true);
    expect(accessTokenStillValid({
      accessToken: 'x',
      connectedAt: new Date(Date.now() - 4000 * 1000),
      expiresIn: 3600,
    })).toBe(false);
  });
});
