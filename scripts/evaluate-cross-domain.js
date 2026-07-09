/* eslint-disable no-console */
// scripts/evaluate-cross-domain.js
// ============================================
// Cross-domain + bilingual SCORECARD (richer than CI gate, still offline by default).
// ============================================
// Offline (default): Track-A over intent golden + XD suite → accuracy, XD F1,
// entity F1, language accuracy, floors that fail CI-style callers.
// Model-assisted (RUN_LLM_EVAL=1): reply language + dual-domain term check.
//
// Run: npm run test:eval:xdom
//      RUN_LLM_EVAL=1 npm run test:eval:xdom

const fs = require('fs');
const path = require('path');
const { parseMessageWithBert } = require('../server/services/ai/bertNlpService');
const { parseMessage, _detectLang: detectLang } = require('../server/services/ai/nlpService');

const evalDir = path.join(__dirname, '..', 'tests', 'model-eval');
const outputPath = process.env.XDOM_EVAL_OUTPUT
  || path.join(__dirname, '..', 'output', 'model-eval', 'cross-domain-latest.json');
const NUM_TOL = Number(process.env.MODEL_EVAL_NUMERIC_TOLERANCE || 0.01);
const runLlm = process.env.RUN_LLM_EVAL === '1';
const MIN_TRUE_XD = Number(process.env.XDOM_MIN_TRUE_XD || 10);

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

const HEALTH_TERMS = /(health|healthy|sleep|slept|rest|steps|walk|run|water|exercise|workout|meal|dinner|lunch|food|eat|diet|nutrition|mood|feel|energy|heart|calorie|صحة|صحي|نوم|نمت|راحة|خطوة|مشي|ماء|تمرين|وجبة|عشاء|غداء|طعام|أكل|مزاج|طاقة|سعرات)/i;
const FINANCE_TERMS = /(spent|spend|spending|earn|income|budget|cost|price|save|saving|money|expense|dollar|\$|₪|أنفقت|صرفت|دخل|ميزانية|تكلفة|سعر|ادخار|توفير|مال|إنفاق|دولار|شيكل)/i;

const evalOffline = (cases) => {
  const rows = [];
  const xd = { tp: 0, fp: 0, fn: 0, tn: 0 };
  const ent = { expected: 0, predicted: 0, matched: 0 };
  let intentOk = 0; let domainOk = 0; let langOk = 0; let langTotal = 0;
  let phantomNutrition0 = 0;
  let contractBreaks = 0;

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
      else xd.tn += 1;
    }

    const hasH = (r.entities || []).some((e) => e.domain === 'health');
    const hasF = (r.entities || []).some((e) => e.domain === 'finance');
    if (Boolean(r.is_cross_domain) !== (hasH && hasF)) contractBreaks += 1;
    if ((r.entities || []).some((e) => e.type === 'nutrition' && Number(e.value) === 0)) {
      phantomNutrition0 += 1;
    }

    const expEnts = exp.entities || [];
    ent.expected += expEnts.length;
    ent.predicted += (r.entities || []).length;
    ent.matched += expEnts.filter((e) => (r.entities || []).some((a) => entityMatches(a, e))).length;

    if (c.lang) { langTotal += 1; langOk += detectLang(c.message) === c.lang ? 1 : 0; }
    rows.push({
      id: c.id,
      lang: c.lang,
      intent_ok: iOk,
      domain_ok: dOk,
      actual: {
        intent: r.intent,
        domain: r.domain,
        is_cross_domain: Boolean(r.is_cross_domain),
        entities: (r.entities || []).map((e) => ({
          domain: e.domain, type: e.type, value: e.value, amount: e.amount, unit: e.unit,
        })),
      },
    });
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
    cross_domain: {
      precision: Number(xdP.toFixed(4)),
      recall: Number(xdR.toFixed(4)),
      f1: f1(xdP, xdR),
      tp: xd.tp,
      fp: xd.fp,
      fn: xd.fn,
      tn: xd.tn,
    },
    entity_type: {
      precision_pct: Number((eP * 100).toFixed(2)),
      recall_pct: Number((eR * 100).toFixed(2)),
      f1_pct: Number((f1(eP, eR) * 100).toFixed(2)),
    },
    language_detect_accuracy_pct: pct(langOk, langTotal),
    quality_guards: {
      phantom_nutrition_zero: phantomNutrition0,
      is_cross_domain_contract_breaks: contractBreaks,
      true_xd_labeled: cases.filter((c) => c.expected.is_cross_domain === true).length,
    },
    by_language: byLang,
    rows,
  };
};

const evalReplies = async (cases) => {
  const rows = [];
  let langOk = 0; let langTotal = 0; let linkOk = 0; let linkTotal = 0;
  for (const c of cases) {
    let reply = '';
    try {
      const res = await parseMessage(c.message, null, {}, { provider: 'openrouter' });
      reply = String(res.response || '');
    } catch {
      reply = '';
    }
    const replyLang = detectLang(reply);
    const langMatch = !c.lang || replyLang === c.lang;
    if (c.lang && reply) { langTotal += 1; langOk += langMatch ? 1 : 0; }
    let linkMatch = null;
    if (c.expected.is_cross_domain) {
      linkMatch = HEALTH_TERMS.test(reply) && FINANCE_TERMS.test(reply);
      linkTotal += 1; linkOk += linkMatch ? 1 : 0;
    }
    rows.push({
      id: c.id, lang: c.lang, reply_lang: replyLang, lang_match: langMatch,
      cross_domain_link: linkMatch, reply: reply.slice(0, 120),
    });
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
  console.log(JSON.stringify({
    offline: {
      intent_accuracy_pct: offline.intent_accuracy_pct,
      domain_accuracy_pct: offline.domain_accuracy_pct,
      cross_domain: offline.cross_domain,
      entity_type_f1_pct: offline.entity_type.f1_pct,
      language_detect_accuracy_pct: offline.language_detect_accuracy_pct,
      quality_guards: offline.quality_guards,
      by_language: offline.by_language,
    },
    model_assisted: replies && {
      reply_language_match_pct: replies.reply_language_match_pct,
      cross_domain_link_pct: replies.cross_domain_link_pct,
    },
  }, null, 2));
  console.log(`\nEvidence written to ${path.relative(path.join(__dirname, '..'), outputPath)}`);

  const floors = {
    intent: offline.intent_accuracy_pct === 100,
    domain: offline.domain_accuracy_pct === 100,
    xd_f1: offline.cross_domain.f1 === 1,
    xd_mass: offline.quality_guards.true_xd_labeled >= MIN_TRUE_XD,
    no_phantom0: offline.quality_guards.phantom_nutrition_zero === 0,
    contract: offline.quality_guards.is_cross_domain_contract_breaks === 0,
    lang: offline.language_detect_accuracy_pct === 100,
    no_unknown_lang: !offline.by_language.unknown,
  };
  const failed = Object.entries(floors).filter(([, ok]) => !ok).map(([k]) => k);
  if (failed.length) {
    console.error('\nFLOOR FAIL:', failed.join(', '));
    process.exitCode = 2;
  } else {
    console.log('\nFLOORS: all green (intent/domain/xd/f1/mass/phantom/contract/lang).');
    process.exitCode = 0;
  }
};

main().catch((e) => { console.error(e); process.exitCode = 1; });
