// tests/redisRateLimitStore.test.js
// Unit tests against an in-memory fake Redis — no real Redis required.

const { RedisRateLimitStore } = require('../server/middleware/redisRateLimitStore');

class FakeRedis {
  constructor() {
    this.data = new Map(); // key -> number as string
    this.exp = new Map(); // key -> expiresAt ms
  }

  _live(key) {
    const e = this.exp.get(key);
    if (e != null && Date.now() > e) {
      this.data.delete(key);
      this.exp.delete(key);
      return false;
    }
    return this.data.has(key);
  }

  async get(key) {
    return this._live(key) ? this.data.get(key) : null;
  }

  async incr(key) {
    const n = this._live(key) ? parseInt(this.data.get(key), 10) + 1 : 1;
    this.data.set(key, String(n));
    return n;
  }

  async decr(key) {
    if (!this._live(key)) return 0;
    const n = parseInt(this.data.get(key), 10) - 1;
    this.data.set(key, String(n));
    return n;
  }

  async del(key) {
    this.data.delete(key);
    this.exp.delete(key);
    return 1;
  }

  async pexpire(key, ms) {
    this.exp.set(key, Date.now() + ms);
    return 1;
  }

  async pttl(key) {
    if (!this._live(key)) return -2;
    const e = this.exp.get(key);
    if (e == null) return -1;
    return Math.max(0, e - Date.now());
  }
}

describe('RedisRateLimitStore', () => {
  test('requires a prefix', () => {
    expect(() => new RedisRateLimitStore('')).toThrow(/prefix/);
  });

  test('increment returns totalHits and resetTime; first hit sets window', async () => {
    const redis = new FakeRedis();
    const store = new RedisRateLimitStore('auth', redis);
    store.init({ windowMs: 60_000 });

    const a = await store.increment('user:1');
    expect(a.totalHits).toBe(1);
    expect(a.resetTime).toBeInstanceOf(Date);
    expect(a.resetTime.getTime()).toBeGreaterThan(Date.now());

    const b = await store.increment('user:1');
    expect(b.totalHits).toBe(2);

    const other = await store.increment('user:2');
    expect(other.totalHits).toBe(1);
  });

  test('get returns undefined for missing keys', async () => {
    const store = new RedisRateLimitStore('chat', new FakeRedis());
    expect(await store.get('nope')).toBeUndefined();
  });

  test('resetKey clears the counter', async () => {
    const redis = new FakeRedis();
    const store = new RedisRateLimitStore('otp', redis);
    store.init({ windowMs: 5000 });
    await store.increment('k');
    await store.increment('k');
    await store.resetKey('k');
    expect(await store.get('k')).toBeUndefined();
  });

  test('decrement lowers hits; zero deletes', async () => {
    const redis = new FakeRedis();
    const store = new RedisRateLimitStore('general', redis);
    store.init({ windowMs: 5000 });
    await store.increment('k');
    await store.increment('k');
    await store.decrement('k');
    const mid = await store.get('k');
    expect(mid.totalHits).toBe(1);
    await store.decrement('k');
    expect(await store.get('k')).toBeUndefined();
  });

  test('prefixes isolate limiters', async () => {
    const redis = new FakeRedis();
    const auth = new RedisRateLimitStore('auth', redis);
    const chat = new RedisRateLimitStore('chat', redis);
    auth.init({ windowMs: 1000 });
    chat.init({ windowMs: 1000 });
    await auth.increment('same-key');
    await auth.increment('same-key');
    const chatHits = await chat.increment('same-key');
    expect(chatHits.totalHits).toBe(1);
    expect((await auth.get('same-key')).totalHits).toBe(2);
  });
});
