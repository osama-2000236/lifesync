const { OAuth2Client } = require('google-auth-library');
const {
  verifyGoogleCredential,
  _parseGoogleClientIds,
  _readUnverifiedAudience,
  _normalizeGoogleVerifyError,
} = require('../server/services/googleAuthService');

describe('googleAuthService', () => {
  const originalClientIds = process.env.GOOGLE_AUTH_CLIENT_IDS;

  afterEach(() => {
    jest.restoreAllMocks();
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

  test('verifies credentials against the configured LifeSync web client', async () => {
    const clientId = '190237143688-0ddtrdq3die8hnce0aqbti3jgc2eam4g.apps.googleusercontent.com';
    process.env.GOOGLE_AUTH_CLIENT_IDS = clientId;
    const verify = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockImplementation(async (options) => {
      expect(options).toEqual({ idToken: 'signed-google-token', audience: clientId });
      return {
        getPayload: () => ({
          sub: 'google-user-1',
          email: 'person@example.com',
          email_verified: true,
          name: 'Test Person',
          picture: 'https://example.com/avatar.png',
          iss: 'https://accounts.google.com',
        }),
      };
    });

    await expect(verifyGoogleCredential('signed-google-token')).resolves.toEqual({
      subject: 'google-user-1',
      email: 'person@example.com',
      name: 'Test Person',
      avatarUrl: 'https://example.com/avatar.png',
    });
    expect(verify).toHaveBeenCalledTimes(1);
  });

  test('reads only the public audience claim for diagnostics', () => {
    const payload = Buffer.from(JSON.stringify({ aud: 'web-client.apps.googleusercontent.com' }))
      .toString('base64url');

    expect(_readUnverifiedAudience(`header.${payload}.signature`))
      .toBe('web-client.apps.googleusercontent.com');
    expect(_readUnverifiedAudience('invalid-token')).toBeNull();
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
