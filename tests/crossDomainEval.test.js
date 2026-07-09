// tests/crossDomainEval.test.js
// ============================================
// Cross-domain + bilingual intent EVAL HARNESS (deterministic, CI-gated).
// ============================================
// Layers:
//   1) Intent golden (cases.json) — single-domain + clarification, every case has lang.
//   2) True XD + negatives (cross_domain_cases.json) — dual-domain extracts,
//      forbid phantom entities (e.g. nutrition value 0), is_cross_domain contract.
//   3) Shadow gaps (cross_domain_shadow_cases.json) — known failures pinned;
//      pin breaks when fixed → promote into gating.
//   4) Link contract — pure check that XD extracts would produce ≥1 health+finance
//      pair for LinkedDomain (mirrors chatController gate without DB).
//
// Offline only (Track-A). Scorecard script: npm run test:eval:xdom

const fs = require('fs');
const path = require('path');

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
const MIN_TRUE_XD = 10;

const entityMatches = (actual, expected) => {
  if (actual.domain !== expected.domain || actual.type !== expected.type) return false;
  for (const key of ['value', 'amount']) {
    if (typeof expected[key] === 'number') {
      if (typeof actual[key] !== 'number' || Math.abs(actual[key] - expected[key]) > NUM_TOL) return false;
    }
  }
  return true;
};

const forbiddenHit = (actuals, forbidden) => {
  if (!forbidden) return null;
  for (const f of forbidden) {
    const hit = (actuals || []).find((a) => {
      if (a.domain !== f.domain || a.type !== f.type) return false;
      if (typeof f.value === 'number') return Number(a.value) === f.value;
      return true;
    });
    if (hit) return hit;
  }
  return null;
};

const runCase = (c) => parseMessageWithBert(c.message, null, {});

const assertGating = (c, r) => {
  const exp = c.expected;
  expect(r.intent).toBe(exp.intent);
  expect(r.domain).toBe(exp.domain);
  if (typeof exp.is_cross_domain === 'boolean') {
    expect(Boolean(r.is_cross_domain)).toBe(exp.is_cross_domain);
  }
  if (exp.forbid_is_cross_domain) {
    expect(Boolean(r.is_cross_domain)).toBe(false);
  }
  if (typeof exp.needs_clarification === 'boolean') {
    expect(Boolean(r.needs_clarification)).toBe(exp.needs_clarification);
  }
  if (Array.isArray(exp.entities)) {
    for (const e of exp.entities) {
      expect(r.entities.some((a) => entityMatches(a, e))).toBe(true);
    }
    expect(r.entities.length).toBe(exp.entities.length);
  }
  const bad = forbiddenHit(r.entities, exp.forbid_entities);
  expect(bad).toBeNull();
  // True XD contract: flag iff both domains present in entities.
  const hasH = (r.entities || []).some((e) => e.domain === 'health');
  const hasF = (r.entities || []).some((e) => e.domain === 'finance');
  expect(Boolean(r.is_cross_domain)).toBe(hasH && hasF);
  if (c.lang) expect(detectLang(c.message)).toBe(c.lang);
};

describe('cross-domain + bilingual intent eval (gating)', () => {
  const intentCases = load('cases.json');
  const xdCases = load('cross_domain_cases.json');
  const gating = [...intentCases, ...xdCases];

  test('golden set is non-trivial and well-formed', () => {
    expect(gating.length).toBeGreaterThanOrEqual(20);
    expect(gating.every((c) => c.lang === 'en' || c.lang === 'ar')).toBe(true);
    expect(gating.every((c) => c.id && c.message && c.expected)).toBe(true);
    // No duplicate ids across files
    const ids = gating.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Real XD mass (not 3-template theater)
    const trueXd = xdCases.filter((c) => c.expected.is_cross_domain === true);
    expect(trueXd.length).toBeGreaterThanOrEqual(MIN_TRUE_XD);
    expect(trueXd.some((c) => c.lang === 'ar')).toBe(true);
    expect(trueXd.some((c) => c.lang === 'en')).toBe(true);
    // Negatives: single-domain must not claim XD
    expect(xdCases.some((c) => c.expected.is_cross_domain === false)).toBe(true);
  });

  test.each(intentCases.map((c) => [c.id, c]))('intent golden %s', async (_id, c) => {
    assertGating(c, await runCase(c));
  });

  test.each(xdCases.map((c) => [c.id, c]))('cross-domain suite %s', async (_id, c) => {
    assertGating(c, await runCase(c));
  });
});

describe('cross-domain link readiness (chatController contract)', () => {
  const trueXd = load('cross_domain_cases.json').filter((c) => c.expected.is_cross_domain === true);

  test.each(trueXd.map((c) => [c.id, c]))('%s would create a health+finance link pair', async (_id, c) => {
    const r = await runCase(c);
    const health = (r.entities || []).filter((e) => e.domain === 'health');
    const finance = (r.entities || []).filter((e) => e.domain === 'finance');
    expect(r.is_cross_domain).toBe(true);
    expect(health.length).toBeGreaterThanOrEqual(1);
    expect(finance.length).toBeGreaterThanOrEqual(1);
    // Mirror createCrossDomainLinks gate: at least one pair
    expect(health.length * finance.length).toBeGreaterThanOrEqual(1);
    // No phantom 0-kcal nutrition
    expect(health.some((e) => e.type === 'nutrition' && Number(e.value) === 0)).toBe(false);
  });
});

describe('cross-domain shadow gaps (pinned; promote when fixed)', () => {
  const shadow = load('cross_domain_shadow_cases.json');

  test('outstanding shadow list is well-formed', () => {
    expect(Array.isArray(shadow)).toBe(true);
    // Empty means prior shadows were promoted into gating (XD-EN-09/10, XD-AR-07).
    for (const c of shadow) {
      expect(c.id && c.message && c.expected && c.actual_today).toBeTruthy();
    }
  });

  if (shadow.length > 0) {
    test.each(shadow.map((c) => [c.id, c]))('%s still behaves as documented', async (_id, c) => {
      const r = await runCase(c);
      expect(r.intent).toBe(c.actual_today.intent);
      expect(r.domain).toBe(c.actual_today.domain);
      if (typeof c.actual_today.is_cross_domain === 'boolean') {
        expect(Boolean(r.is_cross_domain)).toBe(c.actual_today.is_cross_domain);
      }
      // Still not at target — when this fails, promote the case into gating.
      expect(r.intent).not.toBe(c.expected.intent);
    });
  }
});
