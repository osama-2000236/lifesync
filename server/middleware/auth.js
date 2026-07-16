// server/middleware/auth.js
// ============================================
// JWT Authentication Middleware
// Verifies access tokens and attaches user to request
// ============================================

const User = require('../models/User');
const { verifyAccessToken, issuedBeforePasswordChange } = require('../utils/tokenUtils');

/**
 * Middleware: Verify JWT token from Authorization header
 * Attaches user object to req.user on success
 */
const authenticate = async (req, res, next) => {
  try {
    // Extract token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.',
      });
    }

    // Authorization: Bearer only (no cookie auth — avoids CSRF on state-changing APIs).
    const token = authHeader.slice(7).trim();
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.',
      });
    }

    // Verify token — HS256 only (tokenUtils pins algorithms; never alg:none / swap).
    // Fail closed: any verify throw → 401, never next() with a partial user.
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token expired. Please login again.',
          code: 'TOKEN_EXPIRED',
        });
      }
      return res.status(401).json({
        success: false,
        error: 'Invalid token.',
      });
    }

    // Load user from DB (role/is_active from DB — never trust JWT claims alone).
    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['hashed_password'] },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found. Token may be invalid.',
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: 'Account has been deactivated.',
      });
    }

    // Password change revokes every earlier token (stolen sessions included).
    if (issuedBeforePasswordChange(decoded, user)) {
      return res.status(401).json({
        success: false,
        error: 'Session expired after a password change. Please login again.',
        code: 'TOKEN_REVOKED',
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication error.',
    });
  }
};

/**
 * Middleware: Optional authentication
 * Missing/invalid/expired token → continue as anonymous (never 401).
 * Only attaches req.user when token verifies AND the DB user is active.
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    const token = authHeader.slice(7).trim();
    if (!token) return next();

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch {
      return next(); // bad/expired → anonymous
    }

    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['hashed_password'] },
    });
    if (user && user.is_active && !issuedBeforePasswordChange(decoded, user)) {
      req.user = user;
    }
    return next();
  } catch (error) {
    console.error('optionalAuth error:', error);
    return next(); // never block the route for optional auth
  }
};

module.exports = { authenticate, optionalAuth };
