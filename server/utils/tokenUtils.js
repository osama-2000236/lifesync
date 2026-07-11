// server/utils/tokenUtils.js
// ============================================
// JWT Token Generation Utilities
// Access + refresh tokens — HS256 only, secrets required.
// ============================================

const jwt = require('jsonwebtoken');

const HS256 = { algorithm: 'HS256' };
const VERIFY_HS256 = { algorithms: ['HS256'] };

/** Fail closed: never sign/verify with missing or placeholder secrets.
 *  Production requires ≥ 32 chars (aligned with ENCRYPTION_KEY policy); the
 *  boot guard in config/productionEnv.js catches this earlier with a clearer
 *  message — this is the runtime backstop. Dev/test keep the 16-char floor. */
const requireSecret = (name) => {
  const secret = process.env[name];
  const min = process.env.NODE_ENV === 'production' ? 32 : 16;
  if (!secret || typeof secret !== 'string' || secret.trim().length < min) {
    throw new Error(
      `${name} is missing or too short (min ${min} chars). Refusing to issue or verify JWTs.`,
    );
  }
  return secret;
};

/**
 * Generate an access token for a user
 * @param {Object} user - User model instance
 * @returns {string} JWT access token
 */
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    requireSecret('JWT_SECRET'),
    // Short-lived by default (15m) — client silently refreshes on 401.
    // Override with JWT_EXPIRES_IN only when you accept a longer stolen-token window.
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m', ...HS256 },
  );
};

/**
 * Generate a refresh token for a user
 * @param {Object} user - User model instance
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user.id },
    requireSecret('JWT_REFRESH_SECRET'),
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d', ...HS256 },
  );
};

/**
 * Generate both access and refresh tokens
 * @param {Object} user - User model instance
 * @returns {{ accessToken: string, refreshToken: string }}
 */
const generateTokenPair = (user) => {
  return {
    accessToken: generateAccessToken(user),
    refreshToken: generateRefreshToken(user),
  };
};

/**
 * Verify an access token (middleware should use this — algorithms pinned).
 * @param {string} token
 * @returns {Object} decoded payload
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, requireSecret('JWT_SECRET'), VERIFY_HS256);
};

/**
 * Verify a refresh token
 * @param {string} token - Refresh token to verify
 * @returns {Object} Decoded token payload
 */
const verifyRefreshToken = (token) => {
  return jwt.verify(token, requireSecret('JWT_REFRESH_SECRET'), VERIFY_HS256);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  _requireSecret: requireSecret,
};
