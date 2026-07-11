// tests/tokenUtils.test.js
// JWT utilities: HS256 pin, expiry, secret required, reject tampered tokens.
require('dotenv').config();
// Fixture secrets if .env absent (tokenUtils does not load dotenv itself).
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  process.env.JWT_SECRET = 'test-jwt-secret-min-16-chars!!';
}
if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 16) {
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-16chars!';
}

const jwt = require('jsonwebtoken');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  _requireSecret,
} = require('../server/utils/tokenUtils');

describe('tokenUtils', () => {
  const user = { id: 42, email: 'u@test.com', role: 'user' };

  test('round-trip access token with HS256 + expiry claim', () => {
    const token = generateAccessToken(user);
    const decoded = verifyAccessToken(token);
    expect(decoded.id).toBe(42);
    expect(decoded.email).toBe('u@test.com');
    expect(decoded.role).toBe('user');
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
    expect(header.alg).toBe('HS256');
  });

  test('default access token TTL is short (15m) when JWT_EXPIRES_IN unset', () => {
    const saved = process.env.JWT_EXPIRES_IN;
    try {
      delete process.env.JWT_EXPIRES_IN;
      // Re-require not needed — expiresIn read at call time
      const token = generateAccessToken(user);
      const decoded = verifyAccessToken(token);
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      // 15m = 900s; allow clock skew / signing delay
      expect(ttl).toBeGreaterThan(60);
      expect(ttl).toBeLessThanOrEqual(16 * 60);
    } finally {
      if (saved === undefined) delete process.env.JWT_EXPIRES_IN;
      else process.env.JWT_EXPIRES_IN = saved;
    }
  });

  test('round-trip refresh token', () => {
    const token = generateRefreshToken(user);
    const decoded = verifyRefreshToken(token);
    expect(decoded.id).toBe(42);
    expect(decoded.email).toBeUndefined();
  });

  test('rejects expired access token', () => {
    const token = jwt.sign(
      { id: 1, email: 'a@b.c', role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '-10s', algorithm: 'HS256' },
    );
    expect(() => verifyAccessToken(token)).toThrow(/jwt expired|TokenExpiredError|expired/i);
  });

  test('rejects tampered signature', () => {
    const token = generateAccessToken(user);
    const parts = token.split('.');
    parts[2] = parts[2].replace(/[A-Za-z]/, (c) => (c === 'a' ? 'b' : 'a'));
    expect(() => verifyAccessToken(parts.join('.'))).toThrow();
  });

  test('rejects wrong secret', () => {
    const token = jwt.sign({ id: 1 }, 'totally-different-secret!!', {
      expiresIn: '1h',
      algorithm: 'HS256',
    });
    expect(() => verifyAccessToken(token)).toThrow();
  });

  test('rejects alg:none forged token', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ id: 1, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    const forged = `${header}.${payload}.`;
    expect(() => verifyAccessToken(forged)).toThrow();
  });

  test('requireSecret rejects missing/short secrets', () => {
    const saved = process.env.JWT_SECRET;
    try {
      delete process.env.JWT_SECRET;
      expect(() => _requireSecret('JWT_SECRET')).toThrow(/missing or too short/i);
      process.env.JWT_SECRET = 'short';
      expect(() => _requireSecret('JWT_SECRET')).toThrow(/missing or too short/i);
    } finally {
      process.env.JWT_SECRET = saved;
    }
  });

  test('production floor is 32 chars (16–31 char secret rejected there, fine in test)', () => {
    const saved = { JWT_SECRET: process.env.JWT_SECRET, NODE_ENV: process.env.NODE_ENV };
    try {
      process.env.JWT_SECRET = 'sixteen-plus-but-under32'; // 24 chars
      expect(() => _requireSecret('JWT_SECRET')).not.toThrow(); // test env: 16 floor
      process.env.NODE_ENV = 'production';
      expect(() => _requireSecret('JWT_SECRET')).toThrow(/min 32/);
      process.env.JWT_SECRET = 'x'.repeat(32);
      expect(() => _requireSecret('JWT_SECRET')).not.toThrow();
    } finally {
      process.env.JWT_SECRET = saved.JWT_SECRET;
      process.env.NODE_ENV = saved.NODE_ENV;
    }
  });
});
