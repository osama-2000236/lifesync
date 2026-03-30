// server/utils/responseHelper.js
// ============================================
// Standardized API Response Helpers
// Ensures consistent JSON response format
// ============================================

/**
 * Send a success response
 * @param {Object} res - Express response object
 * @param {*} data - Response data payload
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code (default: 200)
 */
const success = (res, data = null, message = 'Success', statusCode = 200) => {
  const response = {
    success: true,
    message,
  };

  if (data !== null) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
};

/**
 * Send a created response (201)
 */
const created = (res, data = null, message = 'Created successfully') => {
  return success(res, data, message, 201);
};

/**
 * Send a paginated response
 * @param {Object} res - Express response object
 * @param {Array} data - Array of items
 * @param {Object} pagination - { page, limit, total, totalPages }
 */
const paginated = (res, data, pagination, message = 'Success') => {
  return res.status(200).json({
    success: true,
    message,
    data,
    pagination,
  });
};

/**
 * Send an error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 400)
 * @param {string} code - Error code identifier
 */
const error = (res, message = 'An error occurred', statusCode = 400, code = null) => {
  const response = {
    success: false,
    error: message,
  };

  if (code) response.code = code;

  return res.status(statusCode).json(response);
};

module.exports = { success, created, paginated, error };
