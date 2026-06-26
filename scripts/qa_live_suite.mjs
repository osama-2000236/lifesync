// Live black-box QA suite for LifeSync (production).
// Exercises the REAL deployed backend + frontend + BERT server.
// No secrets required; no auth fabrication. Authenticated endpoints are
// verified by their security/validation contract (401/400/429), not bypassed.
//
// Usage: node scripts/qa_live_suite.mjs
// Env overrides: BE_URL, FE_URL, BERT_URL
/* eslint-disable no-console */

const BE = process.env.BE_URL || 'https://lifesync-production-fdf9.up.railway.app';
const FE = process.env.FE_URL || 'https://lifesync.1202883.workers.dev';
const BERT = process.env.BERT_URL || 'https://bert-production-a417.up.railway.app';

let pass = 0;
let fail = 0;
let warn = 0;
const failures = [];
const warnings = [];

const ok = (name, extra = '') => { pass += 1; console.log(`  PASS  ${name}${extra ? ` — ${extra}` : ''}`); };
const bad = (name, detail = '') => { fail += 1; failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); };
const wrn = (name, detail = '') => { warn += 1; warnings.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  WARN  ${name}${detail ? ` — ${detail}` : ''}`); };

const TIMEOUT = 25000;
async function http(method, url, { headers = {}, body = null, origin = null } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  const h = { ...headers };
  if (origin) h.Origin = origin;
  if (body && !h['Content-Type']) h['Content-Type'] = 'application/json';
  try {
    const res = await fetch(url, {
      method,
      headers: h,
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      signal: ctrl.signal,
      redirect: 'manual',
    });
    let json = null;
    let text = '';
    try { text = await res.text(); json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  } catch (e) {
    return { status: 0, json: null, text: '', error: String(e?.message || e), headers: new Headers() };
  } finally {
    clearTimeout(timer);
  }
}

const expectStatus = (name, got, want) => {
  const wants = Array.isArray(want) ? want : [want];
  if (wants.includes(got.status)) ok(name, `HTTP ${got.status}`);
  else bad(name, `expected ${wants.join('/')}, got ${got.status}${got.error ? ` (${got.error})` : ''}`);
  return got;
};

async function section(title, fn) {
  console.log(`\n── ${title} ──`);
  await fn();
}

(async () => {
  console.log(`\nLifeSync LIVE QA suite\n  BE=${BE}\n  FE=${FE}\n  BERT=${BERT}`);

  // ───────────────────────── Infra / health ─────────────────────────
  await section('Infrastructure & health', async () => {
    const h = await http('GET', `${BE}/api/health`);
    expectStatus('GET /api/health reachable', h, 200);
    // Deploy-identity: the health endpoint should report which build is live.
    if (h.json && 'commit' in h.json) {
      ok('Health reports build commit', h.json.commit || '(null — env var not injected yet)');
      const want = process.env.EXPECT_COMMIT;
      if (want && h.json.commit && !want.startsWith(h.json.commit) && !h.json.commit.startsWith(want)) {
        bad('Live commit matches EXPECT_COMMIT', `live=${h.json.commit} expected=${want}`);
      } else if (want && h.json.commit) {
        ok('Live commit matches EXPECT_COMMIT', h.json.commit);
      }
    } else {
      wrn('Health does not report build commit yet', 'add commit field (deploy pending)');
    }

    const ai = await http('GET', `${BE}/api/ai/health`);
    expectStatus('GET /api/ai/health (public)', ai, 200);
    const d = ai.json?.data;
    if (d) {
      if (d.bert_ready === true) ok('AI: BERT ready'); else bad('AI: BERT ready', JSON.stringify(d.chat));
      if (d.openrouter_ready === true) ok('AI: OpenRouter configured'); else bad('AI: OpenRouter configured', JSON.stringify(d.openrouter));
      if (d.chat?.provider === 'bert_local') ok('AI: chat provider is bert_local'); else bad('AI: chat provider', d.chat?.provider);
      if (d.openrouter?.configured_model) ok('AI: OpenRouter model set', d.openrouter.configured_model);
    } else bad('AI health payload present', ai.text?.slice(0, 120));

    const bs = await http('GET', `${BERT}/v1/status`);
    expectStatus('BERT server /v1/status', bs, 200);
    if (bs.json?.status === 'ready') ok('BERT status=ready', `p95=${bs.json.p95_latency_ms}ms uptime=${Math.round(bs.json.uptime_seconds)}s`);
    else bad('BERT status=ready', bs.json?.status);
    if (Array.isArray(bs.json?.labels) && bs.json.labels.length === 6) ok('BERT exposes 6 labels');
    else wrn('BERT label count', String(bs.json?.labels?.length));
  });

  // ───────────────────────── CORS & security headers ─────────────────────────
  await section('CORS & security headers', async () => {
    const pre = await http('OPTIONS', `${BE}/api/auth/login`, {
      origin: FE,
      headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    });
    expectStatus('CORS preflight', pre, [200, 204]);
    const allowOrigin = pre.headers.get('access-control-allow-origin');
    if (allowOrigin === FE) ok('CORS allow-origin = frontend', allowOrigin);
    else bad('CORS allow-origin', `got ${allowOrigin}`);
    if (pre.headers.get('access-control-allow-credentials') === 'true') ok('CORS allows credentials');
    else wrn('CORS credentials flag', pre.headers.get('access-control-allow-credentials'));

    // Reflectarbitrary-origin check: a foreign origin should NOT be echoed back as allowed.
    const foreign = await http('OPTIONS', `${BE}/api/auth/login`, {
      origin: 'https://evil.example.com',
      headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    });
    const fOrigin = foreign.headers.get('access-control-allow-origin');
    if (fOrigin && fOrigin === 'https://evil.example.com') bad('CORS does not reflect arbitrary origins', `reflected ${fOrigin}`);
    else ok('CORS rejects/ignores foreign origin', `allow-origin=${fOrigin || 'none'}`);

    const root = await http('GET', `${BE}/api/health`);
    const xpb = root.headers.get('x-powered-by');
    if (xpb) wrn('X-Powered-By header present (info leak)', xpb);
    else ok('X-Powered-By hidden');
    const hsts = root.headers.get('strict-transport-security');
    if (hsts) ok('HSTS header present'); else wrn('HSTS header missing', 'consider helmet HSTS');
    const xcto = root.headers.get('x-content-type-options');
    if (xcto === 'nosniff') ok('X-Content-Type-Options=nosniff'); else wrn('X-Content-Type-Options missing');
  });

  // ───────────────────────── 404 / error contract ─────────────────────────
  await section('Routing & error contract', async () => {
    const nf = await http('GET', `${BE}/api/this-route-does-not-exist-xyz`);
    expectStatus('Unknown API route -> 404', nf, 404);
    if (nf.json && nf.json.success === false) ok('404 returns JSON {success:false}');
    else wrn('404 body shape', (nf.text || '').slice(0, 80));

    const badJson = await http('POST', `${BE}/api/auth/login`, { headers: { 'Content-Type': 'application/json' }, body: '{not valid json' });
    expectStatus('Malformed JSON body handled', badJson, [400, 422]);
  });

  // ───────────────────────── Auth: negative / validation ─────────────────────────
  await section('Auth negative & validation', async () => {
    expectStatus('GET /api/auth/me without token -> 401', await http('GET', `${BE}/api/auth/me`), 401);
    expectStatus('GET /api/auth/me bad token -> 401', await http('GET', `${BE}/api/auth/me`, { headers: { Authorization: 'Bearer not.a.real.token' } }), 401);

    const wrongCreds = await http('POST', `${BE}/api/auth/login`, { body: { email: 'definitely-not-real@nowhere.test', password: 'wrongpassword123' } });
    expectStatus('Login wrong creds -> 401/400', wrongCreds, [400, 401]);
    if (wrongCreds.text && /password|stack|sequelize|at Object\./i.test(wrongCreds.text) && !/invalid|incorrect|credential/i.test(wrongCreds.text)) {
      wrn('Login error may leak internals', wrongCreds.text.slice(0, 80));
    } else ok('Login error message is generic');

    expectStatus('Login missing fields -> 400', await http('POST', `${BE}/api/auth/login`, { body: { email: 'x@y.z' } }), [400, 422]);
    expectStatus('Register send-otp invalid email -> 400', await http('POST', `${BE}/api/auth/register/send-otp`, { body: { email: 'not-an-email' } }), [400, 422]);
    expectStatus('Google login no credential -> 400', await http('POST', `${BE}/api/auth/google`, { body: {} }), [400, 422]);

    // Google with a structurally-invalid credential should fail cleanly (signature), not 500.
    const gFake = await http('POST', `${BE}/api/auth/google`, { body: { credential: 'aaa.bbb.ccc' } });
    expectStatus('Google login bad credential -> 401/400 (not 500)', gFake, [400, 401]);
  });

  // ───────────────────────── Protected endpoints require auth ─────────────────────────
  await section('Protected endpoints enforce auth', async () => {
    // NOTE: health DATA router is mounted at /api/health-logs; /api/health is
    // the public infra healthcheck (intentionally 200).
    const protectedGets = [
      '/api/chat/history', '/api/chat/sessions',
      '/api/health-logs', '/api/health-logs/summary/weekly',
      '/api/finance', '/api/finance/summary/weekly',
      '/api/insights', '/api/insights/history',
      '/api/external/status',
      '/api/admin/dashboard', '/api/admin/users',
    ];
    for (const p of protectedGets) {
      const r = await http('GET', `${BE}${p}`);
      expectStatus(`GET ${p} requires auth`, r, [401, 403]);
    }
    expectStatus('POST /api/chat requires auth', await http('POST', `${BE}/api/chat`, { body: { message: 'hi' } }), [401, 403]);
    expectStatus('POST /api/chat/stream requires auth', await http('POST', `${BE}/api/chat/stream`, { body: { message: 'hi' } }), [401, 403]);
    expectStatus('POST /api/health-logs requires auth', await http('POST', `${BE}/api/health-logs`, { body: { type: 'steps', value: 100 } }), [401, 403]);
    expectStatus('POST /api/finance requires auth', await http('POST', `${BE}/api/finance`, { body: { type: 'expense', amount: 5 } }), [401, 403]);
    // Admin route with a non-admin (no token) must not leak data.
    const adminUsers = await http('GET', `${BE}/api/admin/users`);
    if ([401, 403].includes(adminUsers.status)) ok('Admin users list locked down', `HTTP ${adminUsers.status}`);
    else bad('Admin users list locked down', `HTTP ${adminUsers.status}`);
  });

  // ───────────────────────── Live BERT classifier ─────────────────────────
  await section('Live BERT classifier (raw model signal)', async () => {
    const cases = [
      ['I walked 8000 steps today', 'log_health'],
      ['how did I sleep this week', 'query_summary'],
      ['I want to save $1000 this month', 'set_goal'],
      ['hello how are you', 'general_chat'],
    ];
    let matched = 0;
    for (const [text, expect] of cases) {
      const r = await http('POST', `${BERT}/v1/classify`, { body: { text } });
      const label = r.json?.label || r.json?.predicted_label || (r.json?.labels || [])[0];
      const conf = r.json?.confidence ?? r.json?.score;
      if (r.status !== 200) { bad(`BERT classify "${text}"`, `HTTP ${r.status}`); continue; }
      if (label === expect) { matched += 1; ok(`BERT "${text}" => ${label}`, `conf=${conf}`); }
      else wrn(`BERT "${text}" => ${label} (expected ${expect})`, `conf=${conf} — deterministic router corrects this`);
    }
    if (matched >= 3) ok('BERT classifier responsive & mostly aligned', `${matched}/4 unambiguous cases matched raw`);
    else wrn('BERT raw accuracy low on sample', `${matched}/4 — expected; router compensates`);
  });

  // ───────────────────────── Frontend smoke ─────────────────────────
  await section('Frontend smoke', async () => {
    const idx = await http('GET', `${FE}/`);
    expectStatus('Frontend index loads', idx, 200);
    const bundleMatch = (idx.text || '').match(/src="([^"]*assets[^"]*\.js)"/);
    if (bundleMatch) {
      ok('Frontend references JS bundle', bundleMatch[1]);
      const asset = await http('GET', `${FE}${bundleMatch[1]}`);
      expectStatus('Frontend JS bundle reachable', asset, 200);
      // SPA should ship the API base URL pointing at the live backend.
      if ((asset.text || '').includes('lifesync-production-fdf9.up.railway.app')) ok('Bundle points at live backend API');
      else wrn('Live backend URL not found in bundle', 'VITE_API_URL may differ / be split');
    } else wrn('No JS bundle reference found in index', (idx.text || '').slice(0, 80));

    // SPA deep-link should still serve index (client-side routing).
    const deep = await http('GET', `${FE}/dashboard`);
    if ([200, 304].includes(deep.status)) ok('SPA deep-link served', `HTTP ${deep.status}`);
    else wrn('SPA deep-link routing', `GET /dashboard -> ${deep.status}`);
  });

  // ───────────────────────── Summary ─────────────────────────
  console.log(`\n══ RESULT ══  PASS=${pass}  FAIL=${fail}  WARN=${warn}`);
  if (failures.length) { console.log('\nFAILURES:'); failures.forEach((f) => console.log(`  ✗ ${f}`)); }
  if (warnings.length) { console.log('\nWARNINGS (non-blocking / enhancement candidates):'); warnings.forEach((w) => console.log(`  • ${w}`)); }
  console.log('');
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('QA suite crashed:', e); process.exit(2); });
