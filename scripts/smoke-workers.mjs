const WORKERS_BASE_URL =
  (process.env.WORKERS_BASE_URL || 'https://lifesync.1202883.workers.dev').replace(/\/+$/, '');
const RAILWAY_HEALTH_URL =
  process.env.RAILWAY_HEALTH_URL || 'https://lifesync-production-fdf9.up.railway.app/api/health';
const ROUTES = ['/login', '/dashboard', '/chat', '/health', '/finance'];
const REQUEST_TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 30000);

const withTimeout = async (url, timeoutMs = REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const smokeFrontendRoute = async (route) => {
  const url = `${WORKERS_BASE_URL}${route}`;
  const response = await withTimeout(url);
  assert(response.ok, `Route ${route} failed with status ${response.status}`);

  const html = await response.text();
  assert(
    html.includes('<div id="root"></div>'),
    `Route ${route} did not return SPA shell content`
  );

  return { route, status: response.status };
};

const readAssetHash = async () => {
  const response = await withTimeout(`${WORKERS_BASE_URL}/`);
  assert(response.ok, `Root route failed with status ${response.status}`);

  const html = await response.text();
  const scriptMatch = html.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/);
  assert(scriptMatch, 'Unable to extract index asset hash from production HTML');

  return scriptMatch[1];
};

const smokeRailway = async () => {
  const response = await withTimeout(RAILWAY_HEALTH_URL);
  assert(response.ok, `Railway health failed with status ${response.status}`);

  const payload = await response.json();
  assert(payload?.success === true, 'Railway health payload is missing success=true');
};

const API_BASE = RAILWAY_HEALTH_URL.replace(/\/health\/?$/, '');

// AI stack must report the hybrid invariant: BERT in-server + OpenRouter ready.
const smokeAiHealth = async () => {
  const response = await withTimeout(`${API_BASE}/ai/health`);
  assert(response.ok, `AI health failed with status ${response.status}`);
  const { data } = await response.json();
  assert(data?.bert_ready === true, 'BERT (in-server classifier) is not ready');
  assert(data?.openrouter_ready === true, 'OpenRouter is not configured/ready');
  assert((data?.openrouter_models || 0) >= 4, `Expected >=4 OpenRouter models in catalog, got ${data?.openrouter_models}`);
};

// Voice config endpoint must be live and advertise Arabic as RTL.
const smokeVoiceConfig = async () => {
  const response = await withTimeout(`${API_BASE}/voice/config`);
  assert(response.ok, `Voice config failed with status ${response.status}`);
  const { data } = await response.json();
  assert(Array.isArray(data?.languages) && data.languages.some((l) => l.code === 'ar'),
    'Voice config missing Arabic language');
  assert((data?.rtl_languages || []).includes('ar'), 'Voice config missing Arabic RTL flag');
};

// Auth-gated routes must be registered (401, not 404).
const smokeAuthGuard = async (path) => {
  const response = await withTimeout(`${API_BASE}${path}`);
  assert(response.status === 401, `${path} expected 401 (registered+guarded), got ${response.status}`);
};

const main = async () => {
  for (const route of ROUTES) {
    await smokeFrontendRoute(route);
    console.log(`[smoke] ${WORKERS_BASE_URL}${route} OK`);
  }

  await smokeRailway();
  console.log(`[smoke] Railway health OK: ${RAILWAY_HEALTH_URL}`);

  await smokeAiHealth();
  console.log('[smoke] AI health OK: BERT in-server + OpenRouter ready');

  await smokeVoiceConfig();
  console.log('[smoke] Voice config OK: Arabic + RTL advertised');

  await smokeAuthGuard('/insights/gamification');
  console.log('[smoke] Gamification route registered + guarded (401)');

  const hash = await readAssetHash();
  console.log(`[smoke] Active production asset hash: ${hash}`);
};

main().catch((error) => {
  console.error(`[smoke] ${error.message}`);
  process.exit(1);
});
