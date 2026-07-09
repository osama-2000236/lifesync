// server/utils/tokenUtils.js
// ============================================
// JWT Token Generation Utilities
// Access + refresh tokens — HS256 only, secrets required.
// ============================================

const jwt = require('jsonwebtoken');

const HS256 = { algorithm: 'HS256' };
const VERIFY_HS256 = { algorithms: ['HS256'] };

/** Fail closed: never sign/verify with missing or placeholder secrets. */
const requireSecret = (name) => {
  const secret = process.env[name];
  if (!secret || typeof secret !== 'string' || secret.trim().length < 16) {
    throw new Error(
      `${name} is missing or too short (min 16 chars). Refusing to issue or verify JWTs.`,
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
    // Short-lived by default — the client silently refreshes on 401.
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d', ...HS256 },
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
