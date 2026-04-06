const REQUIRED = [
  'VITE_API_URL',
  'VITE_GOOGLE_CLIENT_ID',
];

const EXPECTED_API_URL =
  process.env.EXPECTED_VITE_API_URL
  || 'https://lifesync-production-6f3e.up.railway.app/api';
const EXPECTED_GOOGLE_CLIENT_ID =
  process.env.EXPECTED_VITE_GOOGLE_CLIENT_ID
  || '123174641248-1grp7s1u20ad1d3olkpg28hfe723rkut.apps.googleusercontent.com';
const GOOGLE_CLIENT_ID_PATTERN = /^[0-9]{12}-[a-z0-9-]+\.apps\.googleusercontent\.com$/i;
const REQUIRE_BACKEND_ALIGNMENT = getBooleanEnv('REQUIRE_BACKEND_GOOGLE_ALIGNMENT');

let hasFailures = false;

const fail = (message) => {
  hasFailures = true;
  console.error(`[release-preflight] ${message}`);
};

const get = (key) => (process.env[key] || '').trim();
function getBooleanEnv(key) {
  const value = (process.env[key] || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(value);
}

for (const key of REQUIRED) {
  if (!get(key)) {
    fail(`Missing required environment variable: ${key}`);
  }
}

const apiUrl = get('VITE_API_URL');
if (apiUrl) {
  try {
    const parsed = new URL(apiUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      fail(`VITE_API_URL must use http/https: ${apiUrl}`);
    }
  } catch {
    fail(`VITE_API_URL must be an absolute URL: ${apiUrl}`);
  }

  if (apiUrl !== EXPECTED_API_URL) {
    fail(`VITE_API_URL must equal ${EXPECTED_API_URL}, got ${apiUrl}`);
  }
}

const googleClientId = get('VITE_GOOGLE_CLIENT_ID');
if (googleClientId) {
  if (!GOOGLE_CLIENT_ID_PATTERN.test(googleClientId)) {
    fail(`VITE_GOOGLE_CLIENT_ID is malformed: ${googleClientId}`);
  }

  if (googleClientId !== EXPECTED_GOOGLE_CLIENT_ID) {
    fail(
      `VITE_GOOGLE_CLIENT_ID must equal ${EXPECTED_GOOGLE_CLIENT_ID}, got ${googleClientId}`
    );
  }
}

const backendClientIdsRaw = get('GOOGLE_AUTH_CLIENT_IDS');

if (!backendClientIdsRaw && REQUIRE_BACKEND_ALIGNMENT) {
  fail('Missing required environment variable: GOOGLE_AUTH_CLIENT_IDS');
}

if (backendClientIdsRaw) {
  const backendClientIds = backendClientIdsRaw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!backendClientIds.includes(EXPECTED_GOOGLE_CLIENT_ID)) {
    fail(
      `GOOGLE_AUTH_CLIENT_IDS must include ${EXPECTED_GOOGLE_CLIENT_ID} for frontend/backend alignment.`
    );
  }
}

if (hasFailures) {
  process.exit(1);
}

console.log('[release-preflight] Environment validation passed.');
