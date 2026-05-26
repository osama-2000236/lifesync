// server/middleware/rateLimiter.js
// ============================================
// Granular Rate Limiting (UR17)
//
// Separate rate limits for:
// - Auth endpoints (login, register) — strict
// - Chat/NLP endpoints — moderate
// - General API — lenient
// ============================================

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;

const isEnabled = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
const isLocalStrictGemmaMode = () => {
  const provider = (process.env.INSIGHTS_AI_PROVIDER || process.env.AI_PROVIDER || '').trim().toLowerCase();
  const endpoint = (process.env.CUSTOM_HF_ENDPOINT || '').trim().toLowerCase();

  return process.env.NODE_ENV !== 'production'
    && provider === 'custom_hf'
    && isEnabled(process.env.CUSTOM_HF_STRICT)
    && (endpoint.includes('127.0.0.1') || endpoint.includes('localhost'));
};

/**
 * Auth rate limiter — prevents brute-force login attacks
 * 10 requests per 15 minutes per IP
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again in 15 minutes.',
    code: 'AUTH_RATE_LIMIT',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by IP + email (if present) to prevent distributed attacks
    const email = req.body?.email || '';
    return `${ipKeyGenerator(req.ip)}:${email.toLowerCase().trim()}`;
  },
  skip: (req) => process.env.NODE_ENV === 'test',
});

/**
 * OTP rate limiter — prevents OTP spam
 * 3 OTP requests per 5 minutes per email
 */
const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    error: 'Too many OTP requests. Please wait before requesting a new code.',
    code: 'OTP_RATE_LIMIT',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `otp:${req.body?.email?.toLowerCase()?.trim() || ipKeyGenerator(req.ip)}`,
  skip: (req) => process.env.NODE_ENV === 'test',
});

/**
 * Chat/NLP rate limiter — prevents API cost abuse
 * 30 messages per 5 minutes per user
 */
const chatLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    error: 'Message rate limit reached. Please slow down.',
    code: 'CHAT_RATE_LIMIT',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use JWT user ID if available, fall back to IP
    return req.user?.id ? `chat:${req.user.id}` : `chat:${ipKeyGenerator(req.ip)}`;
  },
  skip: (req) => process.env.NODE_ENV === 'test',
});

/**
 * Insight generation limiter — expensive operation
 * 5 requests per 15 minutes
 */
const insightLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    error: 'Insight generation is rate limited. Please try again later.',
    code: 'INSIGHT_RATE_LIMIT',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `insight:${req.user?.id || ipKeyGenerator(req.ip)}`,
  skip: (req) => process.env.NODE_ENV === 'test' || isLocalStrictGemmaMode(),
});

/**
 * General API limiter — catch-all for all other endpoints
 * 100 requests per 15 minutes per IP
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test',
});

module.exports = {
  authLimiter,
  otpLimiter,
  chatLimiter,
  insightLimiter,
  generalLimiter,
};
