// server/middleware/redisRateLimitStore.js
// ============================================
// express-rate-limit Store backed by Redis (ioredis).
// Used when REDIS_URL / REDIS_HOST is set so multi-instance deploys share
// hit counters. Each limiter MUST get its own instance (library rule).
// ============================================

const { getRedisClient } = require('../services/ephemeralStore');

/**
 * @implements {import('express-rate-limit').Store}
 */
class RedisRateLimitStore {
  /**
   * @param {string} prefix  short name, e.g. 'auth' — becomes rl:auth:<key>
   * @param {object|null} [client]  inject a redis-like client (tests)
   */
  constructor(prefix, client = null) {
    if (!prefix || typeof prefix !== 'string') {
      throw new Error('RedisRateLimitStore requires a non-empty prefix');
    }
    this.prefix = prefix;
    this.windowMs = 60_000;
    this._client = client;
    // Shared across instances → not localKeys.
    this.localKeys = false;
  }

  _redis() {
    return this._client || getRedisClient();
  }

  _k(key) {
    return `rl:${this.prefix}:${key}`;
  }

  init(options) {
    if (options?.windowMs) this.windowMs = options.windowMs;
  }

  async get(key) {
    const redis = this._redis();
    const k = this._k(key);
    const raw = await redis.get(k);
    if (raw == null) return undefined;
    const totalHits = parseInt(raw, 10);
    if (!Number.isFinite(totalHits)) return undefined;
    const ttl = await redis.pttl(k);
    const resetTime = new Date(Date.now() + (ttl > 0 ? ttl : this.windowMs));
    return { totalHits, resetTime };
  }

  async increment(key) {
    const redis = this._redis();
    const k = this._k(key);
    const totalHits = await redis.incr(k);
    // First hit in the window: set TTL. Subsequent hits keep the original window.
    if (totalHits === 1) {
      await redis.pexpire(k, this.windowMs);
    }
    let ttl = await redis.pttl(k);
    // Rare race: key expired between incr and pttl — re-arm.
    if (ttl < 0) {
      await redis.pexpire(k, this.windowMs);
      ttl = this.windowMs;
    }
    return { totalHits, resetTime: new Date(Date.now() + ttl) };
  }

  async decrement(key) {
    const redis = this._redis();
    const k = this._k(key);
    const n = await redis.decr(k);
    if (n <= 0) await redis.del(k);
  }

  async resetKey(key) {
    await this._redis().del(this._k(key));
  }
}

module.exports = { RedisRateLimitStore };
