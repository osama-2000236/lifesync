import 'dotenv/config';

// Probes the LIVE prod stack: backend health + AI health (BERT + OpenRouter).
// Old HF-Space gradio probe removed (Space torn down 2026-06-25; AI now = Railway BERT svc + OpenRouter).
const BASE =
  (process.env.PROBE_BASE_URL
    || process.env.RAILWAY_HEALTH_URL
    || 'https://lifesync-production-fdf9.up.railway.app').replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = Number(process.env.PROBE_REQUEST_TIMEOUT_MS || 30000);

const withTimeout = async (url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const probeBackend = async () => {
  const url = `${BASE}/api/health`;
  const res = await withTimeout(url);
  assert(res.ok, `Backend health failed: status ${res.status}`);
  const payload = await res.json();
  assert(payload?.success === true, 'Backend health payload missing success=true');
  console.log(`[probe] Backend OK: ${url} (commit ${payload.commit || 'n/a'}, env ${payload.env || 'n/a'})`);
};

const probeAi = async () => {
  const url = `${BASE}/api/ai/health`;
  const res = await withTimeout(url);
  assert(res.ok, `AI health failed: status ${res.status}`);
  const payload = await res.json();
  const data = payload?.data || {};
  assert(data.ok === true, 'AI health payload missing data.ok=true');
  assert(data.bert_ready === true, 'BERT runtime not ready (bert_ready!=true)');
  assert(data.openrouter_ready === true, 'OpenRouter not ready (openrouter_ready!=true)');
  console.log(
    `[probe] AI OK: ${url} (chat=${data.chat?.provider}/${data.chat?.status}, ` +
    `insights=${data.insights?.provider}/${data.insights?.status}, ` +
    `openrouter=${data.openrouter?.configured_model}/${data.openrouter?.status})`
  );
};

const main = async () => {
  await probeBackend();
  await probeAi();
  console.log('[probe] All external dependency probes passed.');
};

main().catch((error) => {
  console.error(`[probe] ${error.message}`);
  process.exit(1);
});
