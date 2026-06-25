// E2E verification: BERT classifier path + OpenRouter generative path.
// Drives the REAL parseMessage() so it exercises the same code the website uses.
//   - bert_local  → Track A deterministic reply (local Python server :1235)
//   - openrouter  → Track B conversational reply (OpenRouter API)
// Run: node scripts/verify_bert_openrouter.js
require('dotenv').config();

const { parseMessage } = require('../server/services/ai/nlpService');
const { getAIProviderStatus, classifyText } = require('../server/services/ai/providerClient');

const line = (s) => console.log(s);
const ok = (c) => (c ? 'PASS' : 'FAIL');

(async () => {
  let failures = 0;

  // ── 1. BERT server reachable + ready ──
  line('\n=== 1) BERT server /v1/status ===');
  const bertStatus = await getAIProviderStatus('chat', 'bert_local');
  line(JSON.stringify(bertStatus, null, 2));
  const bertReady = bertStatus.status === 'ready';
  line(`[${ok(bertReady)}] bert_local status === ready`);
  if (!bertReady) failures++;

  // ── 2. Raw classify call returns a label ──
  line('\n=== 2) BERT classify "I spent $20 on lunch" ===');
  try {
    const cls = await classifyText('I spent $20 on lunch');
    line(JSON.stringify(cls).slice(0, 300));
    const hasLabel = !!(cls && (cls.label || cls.intent || cls.predicted_label || Array.isArray(cls.labels)));
    line(`[${ok(hasLabel)}] classifier returned a label`);
    if (!hasLabel) failures++;
  } catch (e) {
    line(`[FAIL] classify threw: ${e.message}`);
    failures++;
  }

  // ── 3. parseMessage via BERT (Track A deterministic) ──
  line('\n=== 3) parseMessage provider=bert_local ===');
  try {
    const r = await parseMessage('I spent $20 on lunch', null, {}, { provider: 'bert_local' });
    line(`intent=${r.intent} domain=${r.domain} entities=${JSON.stringify(r.entities)}`);
    line(`response="${(r.response || '').slice(0, 120)}"`);
    line(`model_runtime=${JSON.stringify(r.model_runtime)}`);
    const loggedFinance = (r.entities || []).some((e) => e.domain === 'finance' && Number(e.amount) === 20);
    line(`[${ok(loggedFinance)}] BERT path extracted a $20 finance entity`);
    if (!loggedFinance) failures++;
  } catch (e) {
    line(`[FAIL] parseMessage(bert_local) threw: ${e.message}`);
    failures++;
  }

  // ── 4. parseMessage via OpenRouter (Track B generative reply) ──
  line('\n=== 4) parseMessage provider=openrouter ===');
  if (!process.env.OPENROUTER_API_KEY) {
    line('[FAIL] OPENROUTER_API_KEY not set');
    failures++;
  } else {
    try {
      const r = await parseMessage('I spent $20 on lunch and felt great', null, {}, { provider: 'openrouter' });
      line(`response="${(r.response || '').slice(0, 200)}"`);
      line(`model_runtime=${JSON.stringify(r.model_runtime)}`);
      const mr = r.model_runtime || {};
      const viaOpenRouter = mr.provider === 'openrouter' && mr.responder === 'generative';
      line(`[${ok(viaOpenRouter)}] reply generated via OpenRouter (provider=openrouter, responder=generative)`);
      if (!viaOpenRouter) {
        line(`    (chat_error if any: ${mr.chat_error || 'none'})`);
        failures++;
      }
      // Track A must STILL have logged the finance entity even on the generative path.
      const stillLogged = (r.entities || []).some((e) => e.domain === 'finance' && Number(e.amount) === 20);
      line(`[${ok(stillLogged)}] BERT extractor still logged $20 alongside OpenRouter reply`);
      if (!stillLogged) failures++;
    } catch (e) {
      line(`[FAIL] parseMessage(openrouter) threw: ${e.message}`);
      failures++;
    }
  }

  line(`\n=== RESULT: ${failures === 0 ? 'ALL PASS ✅' : failures + ' FAILURE(S) ❌'} ===`);
  process.exit(failures === 0 ? 0 : 1);
})();
