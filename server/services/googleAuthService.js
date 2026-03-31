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

const verifyGoogleCredential = async (credential) => {
  const audiences = parseGoogleClientIds();

  if (!audiences.length) {
    throw new Error('Google authentication is not configured.');
  }

  const ticket = await getGoogleClient().verifyIdToken({
    idToken: credential,
    audience: audiences.length === 1 ? audiences[0] : audiences,
  });

  const payload = ticket.getPayload();

  if (!payload?.sub || !payload?.email) {
    throw new Error('Google did not return a valid identity.');
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
};
