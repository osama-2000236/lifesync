const { _parseGoogleClientIds } = require('../server/services/googleAuthService');

describe('googleAuthService', () => {
  const originalClientIds = process.env.GOOGLE_AUTH_CLIENT_IDS;

  afterEach(() => {
    if (originalClientIds === undefined) {
      delete process.env.GOOGLE_AUTH_CLIENT_IDS;
      return;
    }

    process.env.GOOGLE_AUTH_CLIENT_IDS = originalClientIds;
  });

  test('parses comma-separated Google client IDs', () => {
    process.env.GOOGLE_AUTH_CLIENT_IDS = 'client-one.apps.googleusercontent.com, client-two.apps.googleusercontent.com ';

    expect(_parseGoogleClientIds()).toEqual([
      'client-one.apps.googleusercontent.com',
      'client-two.apps.googleusercontent.com',
    ]);
  });

  test('returns an empty array when Google auth is not configured', () => {
    delete process.env.GOOGLE_AUTH_CLIENT_IDS;

    expect(_parseGoogleClientIds()).toEqual([]);
  });
});
