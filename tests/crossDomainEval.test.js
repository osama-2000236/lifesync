// tests/crossDomainEval.test.js
// ============================================
// Cross-domain + bilingual intent EVAL HARNESS (deterministic, CI-gated).
// ============================================
// The project's differentiator is cross-domain intent (health + finance in one
// turn) and it must hold in BOTH English and Arabic. Prompt/lexicon/model tweaks
// happen often; without a gate they can silently regress intent routing. This
// runs the deterministic Track-A extractor (parseMessageWithBert — offline, no
// LLM cost, no network) over golden cases and asserts intent / domain /
// is_cross_domain / entities / clarification, plus per-turn language detection.
//
// Two tiers, mirroring the existing bert_intent shadow pattern:
//   • GATING   (cases.json + cross_domain_cases.json) — must pass; a red bar
//     here means real cross-domain/bilingual quality regressed.
//   • SHADOW   (cross_domain_shadow_cases.json) — known gaps pinned to today's
//     behavior; when one starts passing its target, the pin fails → promote it.
//
// The richer model-assisted scorecard (reply language + LLM-judge) lives in
// scripts/evaluate-cross-domain.js, kept OUT of CI so the gate stays free/fast.

const fs = require('fs');
const path = require('path');

// Force the deterministic rule path (BERT runtime offline) so the eval is exact,
// instant, and network-free — same trick as tests/arabicNlp.test.js.
jest.mock('../server/services/ai/providerClient', () => ({
  classifyText: jest.fn(() => Promise.reject(new Error('bert offline'))),
  generateChat: jest.fn(),
  generateChatStream: jest.fn(),
  getAIProviderStatus: jest.fn(),
  _getProvider: jest.fn(() => 'openrouter'),
  _getProviderSettings: jest.fn(() => ({})),
}));

const { parseMessageWithBert } = require('../server/services/ai/bertNlpService');
const { _detectLang: detectLang } = require('../server/services/ai/nlpService');

const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'model-eval', f), 'utf8'));
const NUM_TOL = 0.01;

// One actual entity matches an expected one when domain+type line up and any
// stated numeric value/amount is within tolerance (extraction is approximate).
const entityMatches = (actual, expected) => {
  if (actual.domain !== expected.domain || actual.type !== expected.type) return false;
  for (const key of ['value', 'amount']) {
    if (typeof expected[key] === 'number') {
      if (typeof actual[key] !== 'number' || Math.abs(actual[key] - expected[key]) > NUM_TOL) return false;
    }
  }
  return true;
};

const runCase = (c) => parseMessageWithBert(c.message, null, {});

const assertGating = (c, r) => {
  const exp = c.expected;
  expect(r.intent).toBe(exp.intent);
  expect(r.domain).toBe(exp.domain);
  if (typeof exp.is_cross_domain === 'boolean') expect(Boolean(r.is_cross_domain)).toBe(exp.is_cross_domain);
  if (typeof exp.needs_clarification === 'boolean') expect(Boolean(r.needs_clarification)).toBe(exp.needs_clarification);
  if (Array.isArray(exp.entities)) {
    // Every expected entity is found, and nothing spurious is logged.
    for (const e of exp.entities) {
      expect(r.entities.some((a) => entityMatches(a, e))).toBe(true);
    }
    expect(r.entities.length).toBe(exp.entities.length);
  }
  if (c.lang) expect(detectLang(c.message)).toBe(c.lang);
};

describe('cross-domain + bilingual intent eval (gating)', () => {
  const gating = [...load('cases.json'), ...load('cross_domain_cases.json')];

  test('golden set is non-trivial', () => {
    expect(gating.length).toBeGreaterThanOrEqual(20);
    // The whole point: some cases must exercise cross-domain and Arabic.
    expect(gating.some((c) => c.expected.is_cross_domain === true || c.expected.domain === 'both')).toBe(true);
    expect(gating.some((c) => c.lang === 'ar')).toBe(true);
  });

  test.each(load('cases.json').map((c) => [c.id, c]))('EN golden %s', async (_id, c) => {
    assertGating(c, await runCase(c));
  });

  test.each(load('cross_domain_cases.json').map((c) => [c.id, c]))('cross-domain/bilingual %s', async (_id, c) => {
    assertGating(c, await runCase(c));
  });
});

describe('cross-domain shadow gaps (pinned to today; promote when fixed)', () => {
  const shadow = load('cross_domain_shadow_cases.json');

  test.each(shadow.map((c) => [c.id, c]))('%s still behaves as documented', async (_id, c) => {
    const r = await runCase(c);
    // Pin current behavior. If routing improves to c.expected, this pin breaks —
    // a deliberate nudge to move the case into the gating set.
    expect(r.intent).toBe(c.actual_today.intent);
    expect(r.domain).toBe(c.actual_today.domain);
    expect(r.intent).not.toBe(c.expected.intent);
  });
});
