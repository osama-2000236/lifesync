const {
  _parseGoogleClientIds,
  _normalizeGoogleVerifyError,
} = require('../server/services/googleAuthService');

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

  test('normalizes wrong-recipient errors to a user-facing message', () => {
    const normalized = _normalizeGoogleVerifyError(
      new Error('Wrong recipient, payload audience != requiredAudience')
    );

    expect(normalized.message).toBe('This Google credential was issued for a different app.');
  });

  test('normalizes malformed token errors to a user-facing message', () => {
    const normalized = _normalizeGoogleVerifyError(
      new Error('Wrong number of segments in token: invalid-token')
    );

    expect(normalized.message).toBe('Invalid Google credential.');
  });

  test('normalizes transient verification failures to a retryable message', () => {
    const normalized = _normalizeGoogleVerifyError(
      new Error('Failed to fetch public keys from Google certificate endpoint')
    );

    expect(normalized.message).toBe('Unable to verify Google sign-in right now.');
  });
});
