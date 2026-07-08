/* eslint-disable no-console */
// scripts/evaluate-cross-domain.js
// ============================================
// Cross-domain + bilingual intent SCORECARD (richer than the CI gate).
// ============================================
// Two layers, following the 2026 eval-harness pattern (deterministic asserts +
// model-assisted checks):
//   1. OFFLINE (default): the deterministic Track-A extractor over the golden
//      set → intent/domain accuracy, cross-domain precision/recall/F1, entity
//      F1, language-detection accuracy, per-language breakdown. Free, no network.
//   2. MODEL-ASSISTED (RUN_LLM_EVAL=1): actually generate the reply and check it
//      is in the RIGHT language (detectLang(reply) === case.lang) and, for
//      cross-domain cases, that it references BOTH domains. Costs model calls, so
//      it's opt-in and never runs in CI.
// ponytail: the reply "judge" is a deterministic language+domain-term heuristic,
// not an LLM judge — free and exact for ar/en; swap in an LLM rubric only if the
// heuristic proves too coarse.
//
// Run: npm run test:eval:xdom   (offline)
//      RUN_LLM_EVAL=1 npm run test:eval:xdom   (adds reply checks)

const fs = require('fs');
const path = require('path');
const { parseMessageWithBert } = require('../server/services/ai/bertNlpService');
const { parseMessage, _detectLang: detectLang } = require('../server/services/ai/nlpService');

const evalDir = path.join(__dirname, '..', 'tests', 'model-eval');
const outputPath = process.env.XDOM_EVAL_OUTPUT
  || path.join(__dirname, '..', 'output', 'model-eval', 'cross-domain-latest.json');
const NUM_TOL = Number(process.env.MODEL_EVAL_NUMERIC_TOLERANCE || 0.01);
const runLlm = process.env.RUN_LLM_EVAL === '1';

const load = (f) => JSON.parse(fs.readFileSync(path.join(evalDir, f), 'utf8'));
const pct = (n, d) => (d ? Number((100 * n / d).toFixed(2)) : null);
const f1 = (p, r) => (p + r ? Number((2 * p * r / (p + r)).toFixed(4)) : 0);

const entityMatches = (a, e) => {
  if (a.domain !== e.domain || a.type !== e.type) return false;
  for (const k of ['value', 'amount']) {
    if (typeof e[k] === 'number' && (typeof a[k] !== 'number' || Math.abs(a[k] - e[k]) > NUM_TOL)) return false;
  }
  return true;
};

// Health/finance term presence — used to check a cross-domain reply actually
// connects the two domains (both English and Arabic vocab).
const HEALTH_TERMS = /(health|healthy|sleep|slept|rest|steps|walk|run|water|exercise|workout|meal|dinner|lunch|food|eat|diet|nutrition|mood|feel|energy|heart|calorie|صحة|صحي|نوم|نمت|راحة|خطوة|مشي|ماء|تمرين|وجبة|عشاء|غداء|طعام|أكل|مزاج|طاقة|سعرات)/i;
const FINANCE_TERMS = /(spent|spend|spending|earn|income|budget|cost|price|save|saving|money|expense|dollar|\$|₪|أنفقت|صرفت|دخل|ميزانية|تكلفة|سعر|ادخار|توفير|مال|إنفاق|دولار|شيكل)/i;

const evalOffline = (cases) => {
  const rows = [];
  const xd = { tp: 0, fp: 0, fn: 0 };            // cross-domain confusion
  const ent = { expected: 0, predicted: 0, matched: 0 };
  let intentOk = 0; let domainOk = 0; let langOk = 0; let langTotal = 0;

  for (const c of cases) {
    const r = c._actual; const exp = c.expected;
    const iOk = r.intent === exp.intent;
    const dOk = r.domain === exp.domain;
    intentOk += iOk ? 1 : 0;
    domainOk += dOk ? 1 : 0;

    if (typeof exp.is_cross_domain === 'boolean') {
      const pred = Boolean(r.is_cross_domain);
      if (exp.is_cross_domain && pred) xd.tp += 1;
      else if (!exp.is_cross_domain && pred) xd.fp += 1;
      else if (exp.is_cross_domain && !pred) xd.fn += 1;
    }
    const expEnts = exp.entities || [];
    ent.expected += expEnts.length;
    ent.predicted += (r.entities || []).length;
    ent.matched += expEnts.filter((e) => (r.entities || []).some((a) => entityMatches(a, e))).length;

    if (c.lang) { langTotal += 1; langOk += detectLang(c.message) === c.lang ? 1 : 0; }
    rows.push({ id: c.id, lang: c.lang, intent_ok: iOk, domain_ok: dOk, actual: { intent: r.intent, domain: r.domain, is_cross_domain: Boolean(r.is_cross_domain) } });
  }

  const xdP = xd.tp + xd.fp ? xd.tp / (xd.tp + xd.fp) : 1;
  const xdR = xd.tp + xd.fn ? xd.tp / (xd.tp + xd.fn) : 1;
  const eP = ent.predicted ? ent.matched / ent.predicted : 1;
  const eR = ent.expected ? ent.matched / ent.expected : 1;

  const byLang = {};
  for (const c of cases) {
    const k = c.lang || 'unknown';
    byLang[k] = byLang[k] || { n: 0, intent: 0, domain: 0 };
    byLang[k].n += 1;
    byLang[k].intent += c._actual.intent === c.expected.intent ? 1 : 0;
    byLang[k].domain += c._actual.domain === c.expected.domain ? 1 : 0;
  }
  for (const k of Object.keys(byLang)) {
    byLang[k].intent_acc_pct = pct(byLang[k].intent, byLang[k].n);
    byLang[k].domain_acc_pct = pct(byLang[k].domain, byLang[k].n);
  }

  return {
    cases: cases.length,
    intent_accuracy_pct: pct(intentOk, cases.length),
    domain_accuracy_pct: pct(domainOk, cases.length),
    cross_domain: { precision: Number(xdP.toFixed(4)), recall: Number(xdR.toFixed(4)), f1: f1(xdP, xdR), tp: xd.tp, fp: xd.fp, fn: xd.fn },
    entity_type: { precision_pct: Number((eP * 100).toFixed(2)), recall_pct: Number((eR * 100).toFixed(2)), f1_pct: Number((f1(eP, eR) * 100).toFixed(2)) },
    language_detect_accuracy_pct: pct(langOk, langTotal),
    by_language: byLang,
    rows,
  };
};

// Model-assisted: generate the real reply and score language + cross-domain link.
const evalReplies = async (cases) => {
  const rows = [];
  let langOk = 0; let langTotal = 0; let linkOk = 0; let linkTotal = 0;
  for (const c of cases) {
    let reply = '';
    try {
      const res = await parseMessage(c.message, null, {}, { provider: 'openrouter' });
      reply = String(res.response || '');
    } catch (e) { reply = ''; }
    const replyLang = detectLang(reply);
    const langMatch = !c.lang || replyLang === c.lang;
    if (c.lang && reply) { langTotal += 1; langOk += langMatch ? 1 : 0; }
    let linkMatch = null;
    if (c.expected.is_cross_domain) {
      linkMatch = HEALTH_TERMS.test(reply) && FINANCE_TERMS.test(reply);
      linkTotal += 1; linkOk += linkMatch ? 1 : 0;
    }
    rows.push({ id: c.id, lang: c.lang, reply_lang: replyLang, lang_match: langMatch, cross_domain_link: linkMatch, reply: reply.slice(0, 120) });
    console.log(`  ${langMatch ? 'LANG_OK ' : 'LANG_BAD'} ${c.id} [${c.lang}→${replyLang}]${c.expected.is_cross_domain ? (linkMatch ? ' LINK_OK' : ' LINK_MISS') : ''}`);
  }
  return {
    reply_language_match_pct: pct(langOk, langTotal),
    cross_domain_link_pct: pct(linkOk, linkTotal),
    rows,
  };
};

const main = async () => {
  const gating = [...load('cases.json'), ...load('cross_domain_cases.json')];
  console.log(`Offline eval: ${gating.length} golden cases (deterministic Track-A)...`);
  for (const c of gating) c._actual = await parseMessageWithBert(c.message, null, {});
  const offline = evalOffline(gating);

  let replies = null;
  if (runLlm) {
    console.log(`\nModel-assisted eval (RUN_LLM_EVAL=1): generating ${gating.length} replies...`);
    replies = await evalReplies(gating);
  } else {
    console.log('\n(Skipping model-assisted reply eval — set RUN_LLM_EVAL=1 to include it.)');
  }

  const report = {
    generated_at: new Date().toISOString(),
    offline,
    model_assisted: replies,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log('\n===== CROSS-DOMAIN SCORECARD =====');
  console.log(JSON.stringify({ offline: { intent_accuracy_pct: offline.intent_accuracy_pct, domain_accuracy_pct: offline.domain_accuracy_pct, cross_domain: offline.cross_domain, entity_type_f1_pct: offline.entity_type.f1_pct, language_detect_accuracy_pct: offline.language_detect_accuracy_pct, by_language: offline.by_language }, model_assisted: replies && { reply_language_match_pct: replies.reply_language_match_pct, cross_domain_link_pct: replies.cross_domain_link_pct } }, null, 2));
  console.log(`\nEvidence written to ${path.relative(path.join(__dirname, '..'), outputPath)}`);

  // Non-zero exit if the offline gate slips, so CI/callers notice.
  const gate = offline.intent_accuracy_pct === 100 && offline.domain_accuracy_pct === 100;
  process.exitCode = gate ? 0 : 2;
};

main().catch((e) => { console.error(e); process.exitCode = 1; });
