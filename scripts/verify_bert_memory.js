#!/usr/bin/env node
/**
 * Offline verification for the BERT conversational-memory fix.
 *
 * Calls parseMessageWithBert() directly (no DB, no network). classifyText may
 * try to reach the BERT server; on failure the engine falls back to rule-based
 * labels, which is fine for these assertions — every case here is resolved by
 * the deterministic short-reply logic BEFORE classification, or by rule labels.
 *
 * Run:  node scripts/verify_bert_memory.js
 * Exit: 0 = all pass, 1 = any failure.
 */
/* eslint-disable no-console */
const path = require('path');
const { parseMessageWithBert } = require(
  path.join(__dirname, '..', 'server', 'services', 'ai', 'bertNlpService.js')
);

let failures = 0;
const check = (name, cond, detail) => {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const GREETING =
  "Hi osama abu jarad! I'm your LifeSync daily assistant — I track health and "
  + "money together and remember what matters to you. How are you feeling today "
  + "(1–10), and what's on your plate?";

const ctxWithLastAssistant = (text, extra = {}) => ({
  profile: { name: 'osama' },
  conversation: [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: text },
  ],
  recent_messages: [
    { role: 'user', message: 'hi', intent: 'query_general' },
    { role: 'assistant', message: text, intent: 'query_general' },
  ],
  memory: { items: [], summary: '', count: 0 },
  health: {},
  source_counts: { messages: 2, health_logs: 0, finance_logs: 0, goals: 0 },
  ...extra,
});

const emptyCtx = () => ({
  profile: { name: 'osama' },
  conversation: [],
  recent_messages: [],
  memory: { items: [], summary: '', count: 0 },
  health: {},
  source_counts: { messages: 0, health_logs: 0, finance_logs: 0, goals: 0 },
});

(async () => {
  console.log('\nBERT conversational-memory verification\n');

  // 1) Mood memory: assistant asked "(1–10)", user replies "4".
  {
    const r = await parseMessageWithBert('4', null, ctxWithLastAssistant(GREETING));
    const mood = (r.entities || []).find((e) => e.type === 'mood');
    console.log('[1] reply "4" after the (1–10) greeting');
    check('intent is log_health', r.intent === 'log_health', `got ${r.intent}`);
    check('logged a mood entity = 4', !!mood && Number(mood.value) === 4,
      mood ? `value=${mood.value}` : 'no mood entity');
    check('reply is NOT the repeated greeting',
      typeof r.response === 'string' && !r.response.includes("what's on your plate"),
      r.response);
    check('reply acknowledges 4/10', /4\s*\/\s*10/.test(r.response || ''), r.response);
  }

  // 2) No false positive: bare "4" with NO prior mood question.
  {
    const r = await parseMessageWithBert('4', null, emptyCtx());
    console.log('[2] reply "4" with empty history (must NOT fabricate a mood)');
    const mood = (r.entities || []).find((e) => e.type === 'mood');
    check('does NOT log a mood from a context-free "4"', !mood,
      mood ? `unexpected mood value=${mood.value}` : '');
  }

  // 3) Transport memory: assistant asked the outing question, user says "bus".
  {
    const q = 'Heading to the city? Nice. Are you going by car, by bus, or on foot? '
      + 'Knowing how you travel lets me keep an eye on both the cost and the movement.';
    const r = await parseMessageWithBert('bus', null, ctxWithLastAssistant(q));
    console.log('[3] reply "bus" after the outing transport question');
    check('resolves the outing (not a repeat question)',
      r.needs_clarification === false && typeof r.response === 'string'
        && /bus|transport|cost|movement|city/i.test(r.response),
      r.response);
  }

  // 4a) Regression: a real expense still logs finance.
  {
    const r = await parseMessageWithBert('spent $12 on lunch', null, emptyCtx());
    console.log('[4a] "spent $12 on lunch" still logs finance');
    const fin = (r.entities || []).find((e) => e.domain === 'finance');
    check('finance entity present', !!fin, JSON.stringify(r.entities));
    check('amount is 12', !!fin && Number(fin.amount) === 12, fin ? `amount=${fin.amount}` : '');
  }

  // 4b) Regression: a real health log still logs health.
  {
    const r = await parseMessageWithBert('slept 7 hours', null, emptyCtx());
    console.log('[4b] "slept 7 hours" still logs health');
    const h = (r.entities || []).find((e) => e.domain === 'health');
    check('health entity present', !!h, JSON.stringify(r.entities));
  }

  // 5) Non-numeric reply after the mood question → soft nudge, NOT the greeting.
  {
    const r = await parseMessageWithBert('meh i dunno', null, ctxWithLastAssistant(GREETING));
    console.log('[5] vague reply after the (1–10) greeting → no parroted greeting');
    check('does not repeat the exact greeting tail',
      typeof r.response === 'string' && !r.response.includes("what's on your plate"),
      r.response);
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error('verify_bert_memory crashed:', err);
  process.exit(1);
});
