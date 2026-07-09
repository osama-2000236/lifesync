// tests/sessionModelLock.test.js
// Durable session model lock is a DB read of first assistant catalog_model —
// not a mutex. No try/finally release needed; concurrent probes share state.

jest.mock('../server/models/ChatLog', () => ({
  findAll: jest.fn(),
}));

const ChatLog = require('../server/models/ChatLog');
const {
  resolveSessionModel,
  assistantModelMeta,
  _readCatalogModel,
} = require('../server/services/ai/sessionModelLock');

describe('sessionModelLock', () => {
  beforeEach(() => {
    ChatLog.findAll.mockReset();
  });

  test('readCatalogModel ignores non-objects', () => {
    expect(_readCatalogModel(null)).toBeNull();
    expect(_readCatalogModel([])).toBeNull();
    expect(_readCatalogModel({ catalog_model: 'openai_chat' })).toBe('openai_chat');
  });

  test('first turn uses requested model when no assistant lock', async () => {
    ChatLog.findAll.mockResolvedValue([]);
    const r = await resolveSessionModel(1, 's1', 'openai_chat');
    expect(r).toMatchObject({ modelId: 'openai_chat', denied: false, locked: null });
  });

  test('locked session denies switch to another model', async () => {
    ChatLog.findAll.mockResolvedValue([
      { entities_json: { catalog_model: 'gemma4_local' } },
    ]);
    const r = await resolveSessionModel(1, 's1', 'openai_chat');
    expect(r).toMatchObject({
      modelId: 'gemma4_local',
      denied: true,
      locked: 'gemma4_local',
      requested: 'openai_chat',
    });
  });

  test('DB failure falls through to requested model (no throw)', async () => {
    ChatLog.findAll.mockRejectedValue(new Error('db down'));
    const r = await resolveSessionModel(1, 's1', 'openrouter_chat');
    expect(r.modelId).toBe('openrouter_chat');
    expect(r.denied).toBe(false);
  });

  test('concurrent resolves see same lock without deadlock', async () => {
    ChatLog.findAll.mockResolvedValue([
      { entities_json: { catalog_model: 'openai_chat' } },
    ]);
    const results = await Promise.all([
      resolveSessionModel(1, 'sess', 'gemma4_local'),
      resolveSessionModel(1, 'sess', 'openrouter_chat'),
      resolveSessionModel(1, 'sess', 'openai_chat'),
    ]);
    expect(results.every((r) => r.modelId === 'openai_chat')).toBe(true);
    expect(results.filter((r) => r.denied).length).toBe(2);
  });

  test('assistantModelMeta payload shape', () => {
    expect(assistantModelMeta('openai_chat')).toEqual({ catalog_model: 'openai_chat' });
    expect(assistantModelMeta(null)).toBeNull();
  });
});
