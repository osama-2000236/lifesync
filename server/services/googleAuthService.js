const { OAuth2Client } = require('google-auth-library');

let googleClient = null;

const parseGoogleClientIds = () => {
  return (process.env.GOOGLE_AUTH_CLIENT_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
};

const getGoogleClient = () => {
  if (!googleClient) {
    googleClient = new OAuth2Client();
  }

  return googleClient;
};

// Read only the public OAuth audience for mismatch diagnostics. This payload is
// never trusted until verifyIdToken succeeds, and the credential itself is not logged.
const readUnverifiedAudience = (credential) => {
  try {
    const payloadSegment = String(credential || '').split('.')[1];
    if (!payloadSegment) return null;
    const payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8'));
    return typeof payload.aud === 'string' ? payload.aud : null;
  } catch {
    return null;
  }
};

const normalizeGoogleVerifyError = (error) => {
  const message = error?.message || '';

  if (/wrong recipient/i.test(message)) {
    return new Error('This Google credential was issued for a different app.');
  }

  if (/(fetch|public keys|certificate|network|socket|econn|enotfound|etimedout)/i.test(message)) {
    return new Error('Unable to verify Google sign-in right now.');
  }

  return new Error('Invalid Google credential.');
};

const verifyGoogleCredential = async (credential) => {
  const audiences = parseGoogleClientIds();

  if (!audiences.length) {
    throw new Error('Google authentication is not configured.');
  }

  let ticket;

  try {
    ticket = await getGoogleClient().verifyIdToken({
      idToken: credential,
      audience: audiences.length === 1 ? audiences[0] : audiences,
    });
  } catch (error) {
    if (/wrong recipient/i.test(error?.message || '')) {
      console.warn('[google-auth] audience mismatch', {
        credentialAudience: readUnverifiedAudience(credential),
        configuredAudiences: audiences,
      });
    }
    throw normalizeGoogleVerifyError(error);
  }

  const payload = ticket.getPayload();

  if (!payload?.sub || !payload?.email) {
    throw new Error('Google did not return a valid identity.');
  }

  // Defense in depth: library verifies signature/aud/exp; pin issuer explicitly.
  const iss = String(payload.iss || '');
  if (iss !== 'accounts.google.com' && iss !== 'https://accounts.google.com') {
    throw new Error('Invalid Google credential.');
  }

  if (!payload.email_verified) {
    throw new Error('Google account email is not verified.');
  }

  return {
    subject: payload.sub,
    email: payload.email.toLowerCase().trim(),
    name: payload.name || payload.given_name || null,
    avatarUrl: payload.picture || null,
  };
};

module.exports = {
  verifyGoogleCredential,
  _parseGoogleClientIds: parseGoogleClientIds,
  _readUnverifiedAudience: readUnverifiedAudience,
  _normalizeGoogleVerifyError: normalizeGoogleVerifyError,
};
