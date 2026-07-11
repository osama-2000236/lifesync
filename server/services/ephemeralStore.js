// server/services/ephemeralStore.js
// ============================================
// Shared TTL key→object store for short-lived cross-request state:
// OTP records, chat clarifications, voice-interview sessions.
//
// Backend is chosen once, at load, from the environment:
//   • Redis   — when REDIS_URL (or REDIS_HOST) is set. Durable across restarts
//               and shared across instances, so a multi-instance deploy no
//               longer loses an OTP / mid-clarification / in-progress interview
//               when the request lands on a different process.
//   • Memory  — otherwise (local/dev/test/single-process). Same API, so
//               single-process behavior is unchanged and npm test needs no Redis.
//
// Contract: every method is *awaitable*. The memory backend returns raw values
// synchronously (so `await store.get(k)` yields the value AND existing sync
// tests that poke the handle directly keep working); the Redis backend returns
// promises. Because Redis does not share the in-process object reference,
// callers MUST re-`set()` after mutating a fetched object — do not rely on
// in-place mutation surviving to the next request.
//
// Failure policy: Redis errors are NOT swallowed. A rejected get/set propagates
// to the caller. For OTP that means create/verify fail closed (registration is
// blocked, never silently bypassed by falling back to memory).
// ============================================

const REDIS_URL = process.env.REDIS_URL
  || (process.env.REDIS_HOST
    ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`
    : null);

const redisEnabled = () => Boolean(REDIS_URL);

// ── Redis (lazy: the driver is only required when a URL is configured) ────────
let sharedRedis = null;
const getRedis = () => {
  if (sharedRedis) return sharedRedis;
  // eslint-disable-next-line global-require
  const Redis = require('ioredis');
  sharedRedis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 2, // fail fast (don't hang OTP/chat when Redis is down)
    ...(process.env.REDIS_TLS === 'true' ? { tls: {} } : {}),
  });
  sharedRedis.on('error', (e) => console.error('[ephemeralStore] redis error:', e.message));
  return sharedRedis;
};

class RedisStore {
  constructor(namespace) { this.ns = namespace; }

  _k(key) { return `${this.ns}:${key}`; }

  async get(key) {
    const raw = await getRedis().get(this._k(key));
    return raw == null ? undefined : JSON.parse(raw);
  }

  async set(key, value, ttlMs) {
    const json = JSON.stringify(value);
    if (ttlMs) await getRedis().set(this._k(key), json, 'PX', ttlMs);
    else await getRedis().set(this._k(key), json);
    return value;
  }

  async del(key) { return getRedis().del(this._k(key)); }
}

// ── Memory: TTL tracked out-of-band so the stored object stays untouched ─────
// (OTP tests mutate record.expiresAt directly and re-read it, so the store must
// not wrap or hide the value.)
class MemoryStore {
  constructor() {
    this.data = new Map(); // key -> value
    this.exp = new Map(); // key -> expiresAtMs
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

  get(key) { return this._live(key) ? this.data.get(key) : undefined; }

  set(key, value, ttlMs) {
    this.data.set(key, value);
    if (ttlMs) this.exp.set(key, Date.now() + ttlMs);
    else this.exp.delete(key);
    return value;
  }

  del(key) { this.exp.delete(key); return this.data.delete(key); }

  // Sync helpers — memory-only, used by tests and the shared sweep.
  has(key) { return this._live(key); }

  clear() { this.data.clear(); this.exp.clear(); }

  sweep(now = Date.now()) {
    for (const [k, e] of this.exp) {
      if (now > e) { this.data.delete(k); this.exp.delete(k); }
    }
  }
}

// One unref'd sweep bounds memory growth from abandoned keys (users who never
// return). Redis does this itself via key TTLs, so only memory stores register.
const memStores = [];
if (process.env.NODE_ENV !== 'test' && !redisEnabled()) {
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const s of memStores) s.sweep(now);
  }, 60_000);
  sweep.unref();
}

const createStore = (namespace) => {
  if (redisEnabled()) return new RedisStore(namespace);
  const store = new MemoryStore();
  memStores.push(store);
  return store;
};

/** Shared Redis client (lazy). Throws if Redis is not configured. */
const getRedisClient = () => {
  if (!redisEnabled()) {
    throw new Error('Redis is not configured (set REDIS_URL or REDIS_HOST).');
  }
  return getRedis();
};

/** Ping Redis when configured. Returns { configured, ok, error? }. Never throws. */
const redisStatus = async () => {
  if (!redisEnabled()) return { configured: false, ok: null };
  try {
    const pong = await getRedis().ping();
    return { configured: true, ok: pong === 'PONG' };
  } catch (err) {
    return { configured: true, ok: false, error: err.message || 'ping_failed' };
  }
};

module.exports = {
  createStore,
  redisEnabled,
  getRedisClient,
  redisStatus,
  _MemoryStore: MemoryStore,
  // Test hook — allow swapping the client after require (rate-limit unit tests).
  _setRedisClientForTests: (client) => { sharedRedis = client; },
  _resetRedisClientForTests: () => { sharedRedis = null; },
};
