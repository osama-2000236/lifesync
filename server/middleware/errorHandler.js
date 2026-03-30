// server/middleware/errorHandler.js
// ============================================
// Global Error Handler Middleware
// Catches all unhandled errors and returns consistent responses
// ============================================

/**
 * Custom application error class
 */
class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handler middleware
 * Must be registered LAST in Express middleware chain
 */
const errorHandler = (err, req, res, _next) => {
  // Default values
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let code = err.code || 'INTERNAL_ERROR';

  // Log error details in development
  if (process.env.NODE_ENV === 'development') {
    console.error('🔴 Error:', {
      message: err.message,
      stack: err.stack,
      statusCode,
    });
  }

  // Handle specific error types
  if (err.name === 'SequelizeValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = err.errors.map((e) => e.message).join(', ');
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 409;
    code = 'DUPLICATE_ENTRY';
    const field = err.errors?.[0]?.path || 'field';
    message = `A record with this ${field} already exists.`;
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    statusCode = 400;
    code = 'INVALID_REFERENCE';
    message = 'Referenced record does not exist.';
  }

  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid authentication token.';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Authentication token has expired.';
  }

  // Send response
  const response = {
    success: false,
    error: message,
    code,
  };

  // Include stack trace in development only
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

/**
 * Handle 404 - Route not found
 */
const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found.`,
    code: 'NOT_FOUND',
  });
};

module.exports = { AppError, errorHandler, notFound };
