// server/services/notificationService.js
// ============================================
// Notification helper — UR9
// Thin wrapper around the Notification model so callers can emit
// alerts without worrying about failures breaking the main flow.
// ============================================

const Notification = require('../models/Notification');

/**
 * Create a notification. Never throws — a failed notification must not
 * break the action that triggered it (insight/report generation, etc.).
 */
const createNotification = async ({ userId, type = 'system', title, message, link = null, metadata = null }) => {
  try {
    return await Notification.create({
      user_id: userId,
      type,
      title,
      message,
      link,
      metadata,
    });
  } catch (err) {
    console.warn('Notification create failed:', err.message);
    return null;
  }
};

const getUnreadCount = (userId) =>
  Notification.count({ where: { user_id: userId, is_read: false } });

module.exports = { createNotification, getUnreadCount };
