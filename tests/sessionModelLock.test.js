// tests/sessionModelLock.test.js
// Mid-chat model switching is allowed — the module only carries per-turn
// model attribution metadata now (assistant row records its catalog model).

const {
  assistantModelMeta,
  _readCatalogModel,
} = require('../server/services/ai/sessionModelLock');

describe('per-turn model metadata (mid-chat switching allowed)', () => {
  test('readCatalogModel ignores non-objects', () => {
    expect(_readCatalogModel(null)).toBeNull();
    expect(_readCatalogModel([])).toBeNull();
    expect(_readCatalogModel({ catalog_model: 'openai_chat' })).toBe('openai_chat');
  });

  test('assistantModelMeta payload shape', () => {
    expect(assistantModelMeta('openai_chat')).toEqual({ catalog_model: 'openai_chat' });
    expect(assistantModelMeta(null)).toBeNull();
  });

  test('meta + read round-trip', () => {
    const meta = assistantModelMeta('openrouter_chat');
    expect(_readCatalogModel(meta)).toBe('openrouter_chat');
    expect(_readCatalogModel([{ domain: 'health' }])).toBeNull();
  });

  test('lock API is gone — no resolveSessionModel export', () => {
    // eslint-disable-next-line global-require
    const mod = require('../server/services/ai/sessionModelLock');
    expect(mod.resolveSessionModel).toBeUndefined();
  });
});
