// tests/ephemeralStore.test.js
// ============================================
// Shared TTL store — memory backend contract. Redis is exercised in prod, not
// here; this locks the get/set/del + TTL semantics that OTP, chat
// clarifications, and voice interviews now depend on (the eviction that used to
// live in per-controller sweep timers).
// ============================================

const { createStore, redisEnabled, _MemoryStore } = require('../server/services/ephemeralStore');

describe('MemoryStore get/set/del', () => {
  let store;
  beforeEach(() => { store = new _MemoryStore(); });

  test('set then get returns the stored value (awaitable but sync)', async () => {
    store.set('a', { n: 1 });
    expect(await store.get('a')).toEqual({ n: 1 });
  });

  test('missing key is undefined', async () => {
    expect(await store.get('nope')).toBeUndefined();
  });

  test('del removes the key', async () => {
    store.set('a', 1);
    store.del('a');
    expect(await store.get('a')).toBeUndefined();
    expect(store.has('a')).toBe(false);
  });

  test('clear wipes everything', () => {
    store.set('a', 1); store.set('b', 2);
    store.clear();
    expect(store.has('a')).toBe(false);
    expect(store.has('b')).toBe(false);
  });
});

describe('MemoryStore TTL eviction (replaces the interview/clarification sweep)', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  test('a key is gone once its ttl elapses', () => {
    const store = new _MemoryStore();
    const t0 = 1_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(t0);
    store.set('sess', { step: 1 }, 5 * 60 * 1000); // 5-min ttl

    expect(store.has('sess')).toBe(true);

    Date.now.mockReturnValue(t0 + 5 * 60 * 1000 + 1); // just past expiry
    expect(store.has('sess')).toBe(false);
    expect(store.get('sess')).toBeUndefined();
  });

  test('sweep drops only expired keys', () => {
    const store = new _MemoryStore();
    const t0 = 2_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(t0);
    store.set('old', 1, 1000);
    store.set('fresh', 2, 60_000);

    Date.now.mockReturnValue(t0 + 2000);
    store.sweep();
    expect(store.has('old')).toBe(false);
    expect(store.has('fresh')).toBe(true);
  });

  test('no ttl means the key never auto-expires', () => {
    const store = new _MemoryStore();
    const t0 = 3_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(t0);
    store.set('perm', 'x');
    Date.now.mockReturnValue(t0 + 10 ** 9);
    expect(store.has('perm')).toBe(true);
  });
});

describe('backend selection', () => {
  test('no REDIS_URL configured in test → memory backend', () => {
    expect(redisEnabled()).toBe(false);
    expect(createStore('x')).toBeInstanceOf(_MemoryStore);
  });
});
