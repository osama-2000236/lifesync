// server/middleware/auth.js
// ============================================
// JWT Authentication Middleware
// Verifies access tokens and attaches user to request
// ============================================

const jwt = require('jsonwebtoken');
const User = require('../models/User');

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

    const token = authHeader.split(' ')[1];

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
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

    // Fetch user from database
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
 * If token is present, verify it. Otherwise, continue without user.
 */
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // No token, continue without user
  }

  // If token exists, run full auth
  return authenticate(req, res, next);
};

module.exports = { authenticate, optionalAuth };
