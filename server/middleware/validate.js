// server/middleware/validate.js
// ============================================
// Request Validation Middleware
// Centralizes express-validator error handling
// ============================================

const { validationResult } = require('express-validator');

/**
 * Middleware: Check validation results and return errors if any
 * Place this after express-validator check chains
 *
 * Usage:
 *   router.post('/register',
 *     [body('email').isEmail(), body('password').isLength({ min: 8 })],
 *     validate,
 *     controller.register
 *   );
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    // Format errors into a cleaner structure
    const formattedErrors = errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
      value: err.value,
    }));

    return res.status(400).json({
      success: false,
      error: 'Validation failed.',
      details: formattedErrors,
    });
  }

  next();
};

module.exports = { validate };
