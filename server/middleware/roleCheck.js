// server/middleware/roleCheck.js
// ============================================
// Role-Based Access Control Middleware
// Restricts routes to specific user roles
// ============================================

/**
 * Middleware factory: Restrict access to specified roles
 * @param  {...string} allowedRoles - Roles that can access the route (e.g., 'admin', 'user')
 * @returns {Function} Express middleware
 *
 * Usage:
 *   router.get('/admin/users', authenticate, authorize('admin'), controller.listUsers);
 *   router.get('/profile', authenticate, authorize('user', 'admin'), controller.getProfile);
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    // authenticate middleware must run first
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
      });
    }

    next();
  };
};

/**
 * Middleware: Restrict to admin only (shorthand)
 */
const adminOnly = authorize('admin');

module.exports = { authorize, adminOnly };
