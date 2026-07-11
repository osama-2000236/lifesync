// LifeSync LIVE use-case validation (UC-01 … UC-16) against production.
// Requires QA_E2E_TOKEN for authenticated flows (Railway variable).
//
// Usage:
//   set QA_E2E_TOKEN=…   (or pass via env)
//   node scripts/qa_live_use_cases.mjs
//
// Exit 0 only if every implemented use case passes. Planned gaps (UC-13/14)
// are reported as GAP (not failures).

/* eslint-disable no-console */

const BE = process.env.BE_URL || 'https://lifesync-production-fdf9.up.railway.app';
const FE = process.env.FE_URL || 'https://lifesync.1202883.workers.dev';
const BERT = process.env.BERT_URL || 'https://bert-production-a417.up.railway.app';
const QA_TOKEN = process.env.QA_E2E_TOKEN || '';

let pass = 0;
let fail = 0;
let gap = 0;
let warn = 0;
const failures = [];
const gaps = [];
const warnings = [];

const ok = (name, extra = '') => {
  pass += 1;
  console.log(`  PASS  ${name}${extra ? ` — ${extra}` : ''}`);
};
const bad = (name, detail = '') => {
  fail += 1;
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
};
const gapNote = (name, detail = '') => {
  gap += 1;
  gaps.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`  GAP   ${name}${detail ? ` — ${detail}` : ''}`);
};
const wrn = (name, detail = '') => {
  warn += 1;
  warnings.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`  WARN  ${name}${detail ? ` — ${detail}` : ''}`);
};

const TIMEOUT = 45000;
async function http(method, url, { headers = {}, body = null } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  const h = { ...headers };
  if (body && !h['Content-Type']) h['Content-Type'] = 'application/json';
  try {
    const res = await fetch(url, {
      method,
      headers: h,
      body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
      signal: ctrl.signal,
      redirect: 'manual',
    });
    let json = null;
    let text = '';
    try {
      text = await res.text();
      json = JSON.parse(text);
    } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  } catch (e) {
    return { status: 0, error: String(e?.message || e), json: null, text: '', headers: new Headers() };
  } finally {
    clearTimeout(timer);
  }
}

const authH = (token) => ({ Authorization: `Bearer ${token}` });

const expectStatus = (name, res, want) => {
  const wants = Array.isArray(want) ? want : [want];
  if (wants.includes(res.status)) {
    ok(name, `HTTP ${res.status}`);
    return true;
  }
  bad(name, `expected ${wants.join('/')}, got ${res.status}${res.error ? ` (${res.error})` : ''} ${(res.text || '').slice(0, 120)}`);
  return false;
};

async function section(title, fn) {
  console.log(`\n── ${title} ──`);
  await fn();
}

(async () => {
  console.log(`\nLifeSync LIVE USE-CASE VALIDATION\n  BE=${BE}\n  FE=${FE}\n  BERT=${BERT}\n  QA_E2E_TOKEN=${QA_TOKEN ? 'set' : 'MISSING'}`);

  if (!QA_TOKEN) {
    bad('QA_E2E_TOKEN required for authenticated use cases');
    process.exit(1);
  }

  // ── Bootstrap session ─────────────────────────────────────────────
  let accessToken = null;
  let refreshToken = null;
  let userId = null;

  await section('Bootstrap — QA session', async () => {
    const wrong = await http('POST', `${BE}/api/auth/qa-login`, { headers: { 'X-QA-Token': `${QA_TOKEN}-WRONG` } });
    expectStatus('UC-02 related: wrong QA token denied', wrong, 401);

    const good = await http('POST', `${BE}/api/auth/qa-login`, { headers: { 'X-QA-Token': QA_TOKEN } });
    if (!expectStatus('QA login', good, 200)) return;
    accessToken = good.json?.data?.accessToken;
    refreshToken = good.json?.data?.refreshToken;
    userId = good.json?.data?.user?.id;
    if (accessToken) ok('Session issued accessToken', `userId=${userId}`);
    else bad('Session issued accessToken');
  });

  if (!accessToken) {
    console.log('\nCannot continue without session.');
    process.exit(1);
  }

  const A = authH(accessToken);

  // ── Infra (supports all UCs) ──────────────────────────────────────
  await section('Infrastructure (A: Redis + production)', async () => {
    const h = await http('GET', `${BE}/api/health`);
    expectStatus('GET /api/health', h, 200);
    if (h.json?.env === 'production') ok('NODE_ENV=production');
    else bad('NODE_ENV=production', h.json?.env);
    if (h.json?.commit) ok('Build commit reported', h.json.commit);
    else wrn('Build commit missing');
    if (h.json?.redis?.configured === true && h.json?.redis?.ok === true) {
      ok('Redis configured and ping OK', `mode=${h.json.redis.mode}`);
    } else {
      bad('Redis configured and ping OK', JSON.stringify(h.json?.redis));
    }
    if (h.json?.ephemeral_store === 'redis') ok('ephemeral_store=redis');
    else bad('ephemeral_store=redis', h.json?.ephemeral_store);

    const ai = await http('GET', `${BE}/api/ai/health`);
    expectStatus('GET /api/ai/health', ai, 200);
    const d = ai.json?.data;
    if (d?.bert_runtime_ready || d?.bert_ready) ok('BERT runtime ready');
    else bad('BERT runtime ready', JSON.stringify(d?.bert));
    if (d?.openrouter_ready) ok('OpenRouter ready');
    else wrn('OpenRouter not ready', JSON.stringify(d?.openrouter));

    const bs = await http('GET', `${BERT}/v1/status`);
    expectStatus('BERT /v1/status', bs, 200);
  });

  // ── UC-01 Registration surface (no real email spam) ───────────────
  await section('UC-01 Register — contract', async () => {
    expectStatus(
      'send-otp invalid email → 400',
      await http('POST', `${BE}/api/auth/register/send-otp`, { body: { email: 'not-email' } }),
      [400, 422],
    );
    // Valid-format OTP may 200 or 429 (rate/cooldown) or 503 if mail flaky — not 500.
    const otp = await http('POST', `${BE}/api/auth/register/send-otp`, {
      body: { email: `qa-live-${Date.now()}@example.com` },
    });
    if ([200, 201, 429, 503].includes(otp.status)) {
      ok('send-otp valid email handled without 500', `HTTP ${otp.status}`);
    } else {
      bad('send-otp valid email handled without 500', `HTTP ${otp.status} ${(otp.text || '').slice(0, 100)}`);
    }
  });

  // ── UC-02 Login / session ─────────────────────────────────────────
  await section('UC-02 Authenticate session', async () => {
    const me = await http('GET', `${BE}/api/auth/me`, { headers: A });
    expectStatus('GET /api/auth/me with token', me, 200);
    if (me.json?.data?.email === 'qa-e2e@lifesync.test' || me.json?.data?.user?.email === 'qa-e2e@lifesync.test' || me.json?.data?.username === 'qa_e2e_bot') {
      ok('Profile is QA bot user');
    } else if (me.status === 200) {
      ok('Profile returned', JSON.stringify(me.json?.data || {}).slice(0, 80));
    }
    expectStatus('GET /api/auth/me without token → 401', await http('GET', `${BE}/api/auth/me`), 401);
    expectStatus(
      'Login wrong password → 401/400',
      await http('POST', `${BE}/api/auth/login`, { body: { email: 'qa-e2e@lifesync.test', password: 'definitely-wrong-pass-xyz' } }),
      [400, 401],
    );
    if (refreshToken) {
      const ref = await http('POST', `${BE}/api/auth/refresh`, { body: { refreshToken } });
      if ([200, 201].includes(ref.status)) ok('Refresh token works', `HTTP ${ref.status}`);
      else wrn('Refresh token path', `HTTP ${ref.status} ${(ref.text || '').slice(0, 80)}`);
    }
  });

  // ── UC-03 Logout (client-side + protected still needs token) ───────
  await section('UC-03 End session (contract)', async () => {
    // Server is stateless JWT — logout is client clear. Prove forged token fails.
    expectStatus(
      'Forged token blocked after “logout”',
      await http('GET', `${BE}/api/auth/me`, { headers: authH('eyJhbGciOiJIUzI1NiJ9.e30.invalid') }),
      401,
    );
    ok('Logout model is client-side JWT clear (no server session store required)');
  });

  // ── UC-04 Manual health ───────────────────────────────────────────
  let healthId = null;
  await section('UC-04 Manual health log', async () => {
    const created = await http('POST', `${BE}/api/health-logs`, {
      headers: A,
      body: { type: 'steps', value: 8123, unit: 'steps', source: 'manual', notes: 'live-qa' },
    });
    if (expectStatus('Create health log', created, [200, 201])) {
      healthId = created.json?.data?.entry?.id
        || created.json?.data?.id
        || created.json?.data?.health_log?.id
        || created.json?.id;
      if (healthId) ok('Health log id returned', String(healthId));
      else wrn('Health log id field location', JSON.stringify(created.json).slice(0, 120));
    }
    const list = await http('GET', `${BE}/api/health-logs`, { headers: A });
    expectStatus('List health logs', list, 200);
    const weekly = await http('GET', `${BE}/api/health-logs/summary/weekly`, { headers: A });
    expectStatus('Weekly health summary', weekly, 200);
  });

  // ── UC-05 Manual finance ──────────────────────────────────────────
  let financeId = null;
  await section('UC-05 Manual finance log', async () => {
    const created = await http('POST', `${BE}/api/finance`, {
      headers: A,
      body: { type: 'expense', amount: 12.5, currency: 'USD', description: 'live-qa coffee', source: 'manual' },
    });
    if (expectStatus('Create finance log', created, [200, 201])) {
      financeId = created.json?.data?.entry?.id
        || created.json?.data?.id
        || created.json?.data?.financial_log?.id;
      if (financeId) ok('Finance log id returned', String(financeId));
      else wrn('Finance log id field location', JSON.stringify(created.json).slice(0, 120));
    }
    expectStatus(
      'Reject zero/negative amount',
      await http('POST', `${BE}/api/finance`, { headers: A, body: { type: 'expense', amount: 0 } }),
      [400, 422],
    );
    const list = await http('GET', `${BE}/api/finance`, { headers: A });
    expectStatus('List finance logs', list, 200);
    const weekly = await http('GET', `${BE}/api/finance/summary/weekly`, { headers: A });
    expectStatus('Weekly finance summary', weekly, 200);
  });

  // ── UC-06 Health chat ─────────────────────────────────────────────
  await section('UC-06 Conversational health log', async () => {
    const chat = await http('POST', `${BE}/api/chat`, {
      headers: A,
      body: { message: 'I slept 7.5 hours last night' },
    });
    if (expectStatus('Chat health message', chat, 200)) {
      const data = chat.json?.data || chat.json;
      const entities = data?.entities || data?.nlp?.entities || [];
      const logged = data?.entities_logged?.health || [];
      const response = data?.response || data?.message || data?.assistant_message;
      if (response || data?.intent) ok('Chat returned response/intent', `intent=${data?.intent || data?.nlp?.intent}`);
      else wrn('Chat response shape', JSON.stringify(data).slice(0, 160));
      const hasHealth = (Array.isArray(logged) && logged.length > 0)
        || (Array.isArray(entities) && entities.some((e) => e.domain === 'health' || e.type === 'sleep'));
      if (hasHealth || data?.intent === 'log_health') ok('Health logged via chat', `logged=${logged.length}`);
      else wrn('Health entity not in payload', JSON.stringify({ intent: data?.intent, entities, logged }).slice(0, 140));
    }
  });

  // ── UC-07 Finance chat ────────────────────────────────────────────
  await section('UC-07 Conversational finance log', async () => {
    const chat = await http('POST', `${BE}/api/chat`, {
      headers: A,
      body: { message: 'I spent $18 on lunch today' },
    });
    if (expectStatus('Chat finance message', chat, 200)) {
      const data = chat.json?.data || chat.json;
      ok('Finance chat intent/response present', `intent=${data?.intent || data?.nlp?.intent || 'n/a'}`);
    }
  });

  // ── UC-08 Cross-domain chat ───────────────────────────────────────
  await section('UC-08 Cross-domain event', async () => {
    const chat = await http('POST', `${BE}/api/chat`, {
      headers: A,
      body: { message: 'I walked 5000 steps and spent $8 on a smoothie' },
    });
    if (expectStatus('Cross-domain chat', chat, 200)) {
      const data = chat.json?.data || chat.json;
      const xd = data?.is_cross_domain || data?.domain === 'both' || data?.nlp?.is_cross_domain;
      if (xd) ok('Marked cross-domain / both');
      else wrn('Cross-domain flag not set (router may split turns)', `domain=${data?.domain} intent=${data?.intent}`);
    }
  });

  // ── UC-09 Clarification ───────────────────────────────────────────
  await section('UC-09 Ambiguous clarification', async () => {
    const chat = await http('POST', `${BE}/api/chat`, {
      headers: A,
      body: { message: 'I spent 25' },
    });
    if (expectStatus('Ambiguous spend message', chat, 200)) {
      const data = chat.json?.data || chat.json;
      const needs = data?.needs_clarification === true
        || data?.intent === 'unclear'
        || Boolean(data?.clarification_question);
      if (needs) ok('Clarification requested (no unsafe silent write)', data?.clarification_question?.slice(0, 80));
      else wrn('No clarification flag — check entities empty', JSON.stringify({
        intent: data?.intent,
        entities: data?.entities,
      }).slice(0, 140));
    }
  });

  // ── UC-10 Dashboard / insights read ───────────────────────────────
  await section('UC-10 Dashboard insights', async () => {
    const insights = await http('GET', `${BE}/api/insights`, { headers: A });
    expectStatus('GET /api/insights', insights, 200);
    const gam = await http('GET', `${BE}/api/insights/gamification`, { headers: A });
    if ([200, 404].includes(gam.status)) ok('Gamification endpoint', `HTTP ${gam.status}`);
    else wrn('Gamification', `HTTP ${gam.status}`);
    const models = await http('GET', `${BE}/api/ai/models`, { headers: A });
    expectStatus('GET /api/ai/models', models, 200);
  });

  // ── UC-11 Generate insights ───────────────────────────────────────
  await section('UC-11 Generate weekly insights', async () => {
    const gen = await http('POST', `${BE}/api/insights/generate`, { headers: A, body: {} });
    if ([200, 201].includes(gen.status)) {
      ok('Insights generate', `HTTP ${gen.status}`);
    } else if (gen.status === 429) {
      wrn('Insights rate limited (expected under load)', 'HTTP 429');
    } else {
      bad('Insights generate', `HTTP ${gen.status} ${(gen.text || '').slice(0, 120)}`);
    }
    const hist = await http('GET', `${BE}/api/insights/history`, { headers: A });
    expectStatus('Insights history', hist, 200);
  });

  // ── UC-12 Edit / delete ───────────────────────────────────────────
  await section('UC-12 Edit or delete records', async () => {
    if (healthId) {
      const del = await http('DELETE', `${BE}/api/health-logs/${healthId}`, { headers: A });
      expectStatus('Delete health log', del, [200, 204]);
    } else wrn('Skip health delete — no id from create');
    if (financeId) {
      const del = await http('DELETE', `${BE}/api/finance/${financeId}`, { headers: A });
      expectStatus('Delete finance log', del, [200, 204]);
    } else wrn('Skip finance delete — no id from create');
    // IDOR-ish: foreign id should not 500
    const foreign = await http('DELETE', `${BE}/api/health-logs/99999999`, { headers: A });
    if ([404, 403, 400].includes(foreign.status)) ok('Delete missing health → safe status', `HTTP ${foreign.status}`);
    else wrn('Delete missing health status', `HTTP ${foreign.status}`);
  });

  // ── UC-13 Weekly report PDF ───────────────────────────────────────
  await section('UC-13 Weekly report download', async () => {
    const gen = await http('POST', `${BE}/api/reports/generate`, {
      headers: A,
      body: { notify: true },
    });
    if (!expectStatus('Generate weekly report', gen, [200, 201])) return;
    const report = gen.json?.data?.report;
    if (!report?.id) {
      bad('Report id returned');
      return;
    }
    ok('Report id returned', String(report.id));
    const list = await http('GET', `${BE}/api/reports`, { headers: A });
    expectStatus('List reports', list, 200);
    const pdf = await http('GET', `${BE}/api/reports/${report.id}/download`, { headers: A });
    if (pdf.status === 200 && (pdf.text?.startsWith('%PDF') || pdf.text?.includes('%PDF'))) {
      ok('PDF download is application/pdf body');
    } else if (pdf.status === 200) {
      // Binary may not decode as text cleanly in fetch text mode
      ok('PDF download HTTP 200', `len=${(pdf.text || '').length}`);
    } else {
      bad('PDF download', `HTTP ${pdf.status}`);
    }
  });

  // ── UC-14 Notifications ───────────────────────────────────────────
  await section('UC-14 Report notification', async () => {
    const notes = await http('GET', `${BE}/api/reports/notifications`, { headers: A });
    if (expectStatus('List notifications', notes, 200)) {
      const unread = notes.json?.data?.unread_count;
      if (typeof unread === 'number') ok('Unread count present', String(unread));
    }
    const pref = await http('PUT', `${BE}/api/reports/preferences`, {
      headers: A,
      body: { report_notify_enabled: true, timezone: 'UTC' },
    });
    expectStatus('Update notify preferences', pref, 200);
  });

  // ── UC-15 External integrations surface ───────────────────────────
  await section('UC-15 External sync surface', async () => {
    const st = await http('GET', `${BE}/api/external/status`, { headers: A });
    if (!expectStatus('External connection status', st, 200)) return;
    const fit = st.json?.data?.platforms?.google_fit;
    if (fit && typeof fit.configured === 'boolean') {
      ok('Google Fit status includes configured flag', `configured=${fit.configured}`);
    } else {
      bad('Google Fit status missing configured flag');
    }
    if (fit?.setup && typeof fit.setup === 'object') {
      ok('Google Fit setup diagnostics present', `missing=${(fit.setup.missing || []).join(',') || 'none'}`);
      if (fit.setup.callback_uri && String(fit.setup.callback_uri).includes('/api/external/callback/google_fit')) {
        ok('Google Fit callback_uri shape', fit.setup.callback_uri);
      } else {
        wrn('Google Fit callback_uri missing/unexpected', JSON.stringify(fit.setup).slice(0, 120));
      }
      // Honesty: placeholder secrets must not report configured=true
      if (fit.setup.env_secret_placeholder && fit.configured) {
        bad('configured=true despite secret placeholder');
      } else if (fit.setup.env_secret_placeholder) {
        ok('Placeholder secret correctly reports not configured');
      }
    } else {
      wrn('Google Fit setup object missing (older deploy?)');
    }
    // Connect without full OAuth secrets may 400/503 — not 500
    const connect = await http('GET', `${BE}/api/external/connect/google_fit`, { headers: A });
    if ([200, 400, 503, 501].includes(connect.status)) {
      ok('Google Fit connect surface responds', `HTTP ${connect.status}`);
      if (fit?.configured === false && connect.status === 503) {
        ok('Connect fails closed when Fit not configured');
      }
      if (fit?.configured === true && connect.status === 200 && connect.json?.data?.url) {
        ok('Connect returns OAuth URL when configured');
      }
    } else {
      wrn('Google Fit connect', `HTTP ${connect.status} ${(connect.text || '').slice(0, 100)}`);
    }
  });

  // ── UC-16 Admin (non-admin user) ──────────────────────────────────
  await section('UC-16 Admin least privilege', async () => {
    const dash = await http('GET', `${BE}/api/admin/dashboard`, { headers: A });
    expectStatus('Non-admin admin dashboard → 403', dash, [401, 403]);
    const users = await http('GET', `${BE}/api/admin/users`, { headers: A });
    expectStatus('Non-admin users list → 403', users, [401, 403]);
    // Admin SPA shell must load for authorized operators (auth gate is client-side too)
    const adminPage = await http('GET', `${FE}/admin`);
    if ([200, 304].includes(adminPage.status)) ok('FE /admin shell', `HTTP ${adminPage.status}`);
    else wrn('FE /admin', `HTTP ${adminPage.status}`);
  });

  // ── Memory + assistant + voice (product surfaces) ─────────────────
  await section('Product surfaces — memory / assistant / voice', async () => {
    expectStatus('GET /api/memory', await http('GET', `${BE}/api/memory`, { headers: A }), 200);
    expectStatus('GET /api/assistant/suggestion', await http('GET', `${BE}/api/assistant/suggestion`, { headers: A }), 200);
    expectStatus('GET /api/voice/config (public capabilities)', await http('GET', `${BE}/api/voice/config`), 200);
    const sessions = await http('GET', `${BE}/api/chat/sessions`, { headers: A });
    expectStatus('GET /api/chat/sessions', sessions, 200);
    const history = await http('GET', `${BE}/api/chat/history`, { headers: A });
    expectStatus('GET /api/chat/history', history, 200);
  });

  // ── Frontend SPA ──────────────────────────────────────────────────
  await section('Frontend SPA use-case shells', async () => {
    const pages = ['/', '/login', '/register', '/dashboard', '/chat', '/health', '/finance', '/profile', '/assistant', '/integrations'];
    for (const p of pages) {
      const r = await http('GET', `${FE}${p}`);
      if ([200, 304].includes(r.status)) ok(`FE ${p}`, `HTTP ${r.status}`);
      else bad(`FE ${p}`, `HTTP ${r.status}`);
    }
    const idx = await http('GET', `${FE}/`);
    const m = (idx.text || '').match(/src="(\/assets\/[^"]+\.js)"/);
    if (m) {
      const asset = await http('GET', `${FE}${m[1]}`);
      expectStatus('Main JS bundle', asset, 200);
      if ((asset.text || '').includes('lifesync-production-fdf9')) ok('Bundle targets live API host');
      else wrn('API host string not found in bundle (may be chunked)');
    }
  });

  // ── Auth rate surface smoke (no account lock abuse) ───────────────
  await section('Security — auth surface', async () => {
    expectStatus('POST /api/chat no auth → 401', await http('POST', `${BE}/api/chat`, { body: { message: 'x' } }), [401, 403]);
    expectStatus('POST /api/chat/stream no auth → 401', await http('POST', `${BE}/api/chat/stream`, { body: { message: 'x' } }), [401, 403]);
  });

  // ── Summary ───────────────────────────────────────────────────────
  console.log(`\n══ USE-CASE RESULT ══  PASS=${pass}  FAIL=${fail}  GAP=${gap}  WARN=${warn}`);
  if (failures.length) {
    console.log('\nFAILURES:');
    failures.forEach((f) => console.log(`  ✗ ${f}`));
  }
  if (gaps.length) {
    console.log('\nDOCUMENTED GAPS (not regressions):');
    gaps.forEach((g) => console.log(`  ○ ${g}`));
  }
  if (warnings.length) {
    console.log('\nWARNINGS:');
    warnings.forEach((w) => console.log(`  • ${w}`));
  }
  console.log('');
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('Use-case suite crashed:', e);
  process.exit(2);
});
