const REQUIRED = [
  'VITE_API_URL',
  'VITE_GOOGLE_CLIENT_ID',
];

const EXPECTED = {
  VITE_API_URL:
    process.env.EXPECTED_VITE_API_URL
    || 'https://lifesync-production-6f3e.up.railway.app/api',
  VITE_GOOGLE_CLIENT_ID:
    process.env.EXPECTED_VITE_GOOGLE_CLIENT_ID
    || '190237143688-0ddtrdq3die8hnce0aqbti3jgc2eam4g.apps.googleusercontent.com',
};

const GOOGLE_CLIENT_ID_PATTERN = /^[0-9]{12}-[a-z0-9-]+\.apps\.googleusercontent\.com$/i;
const localContainerBuild = ['1', 'true', 'yes', 'on'].includes(
  (process.env.LIFESYNC_LOCAL_BUILD || '').trim().toLowerCase()
);

const fail = (message) => {
  console.error(`[preflight] ${message}`);
  process.exitCode = 1;
};

if (localContainerBuild) {
  const apiUrl = (process.env.VITE_API_URL || '').trim();
  const googleClientId = (process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  if (!apiUrl || !(apiUrl.startsWith('/') || /^https?:\/\//i.test(apiUrl))) {
    fail('Local VITE_API_URL must be a relative /path or an absolute http(s) URL.');
  }
  if (googleClientId && !GOOGLE_CLIENT_ID_PATTERN.test(googleClientId)) {
    fail(`VITE_GOOGLE_CLIENT_ID is not a valid Google web client ID: ${googleClientId}`);
  }
  if (process.exitCode) process.exit(process.exitCode);
  console.log('[preflight] Local container build env validation passed.');
  process.exit(0);
}

for (const key of REQUIRED) {
  const value = (process.env[key] || '').trim();
  if (!value) {
    fail(`Missing required build variable: ${key}`);
    continue;
  }

  if (key === 'VITE_API_URL') {
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        fail(`${key} must use http/https: ${value}`);
      }
    } catch {
      fail(`${key} must be an absolute URL: ${value}`);
    }
  }

  if (key === 'VITE_GOOGLE_CLIENT_ID' && !GOOGLE_CLIENT_ID_PATTERN.test(value)) {
    fail(`${key} is not a valid Google web client ID: ${value}`);
  }

  const expectedValue = EXPECTED[key];
  if (expectedValue && value !== expectedValue) {
    fail(`${key} must match release baseline ${expectedValue}, got ${value}`);
  }
}

const backendAllowlist = (process.env.GOOGLE_AUTH_CLIENT_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const expectedGoogleClientId = EXPECTED.VITE_GOOGLE_CLIENT_ID;

if (backendAllowlist.length && !backendAllowlist.includes(expectedGoogleClientId)) {
  fail(
    `GOOGLE_AUTH_CLIENT_IDS must include ${expectedGoogleClientId} when provided.`
  );
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('[preflight] Frontend build env validation passed.');
