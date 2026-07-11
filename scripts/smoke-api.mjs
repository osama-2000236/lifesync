#!/usr/bin/env node
/**
 * Production API smoke — hit public health endpoints.
 *
 * Usage:
 *   SMOKE_API_BASE=https://lifesync-production-fdf9.up.railway.app npm run smoke:api
 *   npm run smoke:api -- http://127.0.0.1:5000
 *
 * Exit 0 only when /api/health returns 200 with success:true.
 * /api/ai/health is checked when reachable; AI not-ready is a soft warning
 * (BERT may be offline while the API is up).
 */

const baseArg = process.argv[2] || process.env.SMOKE_API_BASE || process.env.VITE_API_URL || '';
const base = String(baseArg).replace(/\/api\/?$/, '').replace(/\/$/, '');

if (!base) {
  console.error('[smoke:api] Set SMOKE_API_BASE or pass a base URL (e.g. https://host).');
  process.exit(2);
}

const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 12_000);

const fetchJson = async (path) => {
  const url = `${base}${path}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
    return { url, status: res.status, body };
  } finally {
    clearTimeout(t);
  }
};

let failed = false;

const health = await fetchJson('/api/health');
console.log(`[smoke:api] GET ${health.url} → ${health.status}`);
if (health.status !== 200 || health.body?.success !== true) {
  console.error('[smoke:api] /api/health failed:', JSON.stringify(health.body));
  failed = true;
} else {
  console.log('[smoke:api] version=', health.body.version, 'commit=', health.body.commit, 'redis=', health.body.redis);
}

try {
  const ai = await fetchJson('/api/ai/health');
  console.log(`[smoke:api] GET ${ai.url} → ${ai.status}`);
  if (ai.status !== 200) {
    console.warn('[smoke:api] /api/ai/health non-200 (warn only):', ai.status);
  } else {
    const d = ai.body?.data || ai.body;
    console.log('[smoke:api] ai ok=', d?.ok, 'chat_ready=', d?.chat_ready, 'bert_runtime_ready=', d?.bert_runtime_ready);
  }
} catch (err) {
  console.warn('[smoke:api] /api/ai/health unreachable (warn only):', err.message);
}

if (failed) {
  console.error('[smoke:api] FAILED');
  process.exit(1);
}
console.log('[smoke:api] OK');
