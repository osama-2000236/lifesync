// server/controllers/notificationController.js
// ============================================
// Notification Controller — UR9
// ============================================

const Notification = require('../models/Notification');
const { success, paginated, error } = require('../utils/responseHelper');
const { getUnreadCount } = require('../services/notificationService');

/** GET /api/notifications?unread=true&page=1&limit=20 */
const listNotifications = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const where = { user_id: req.user.id };
    if (String(req.query.unread).toLowerCase() === 'true') where.is_read = false;

    const { count, rows } = await Notification.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    const unread = await getUnreadCount(req.user.id);

    return paginated(
      res,
      rows,
      { page, limit, total: count, totalPages: Math.ceil(count / limit), unread },
      'Notifications',
    );
  } catch (err) {
    next(err);
  }
};

/** GET /api/notifications/unread-count */
const unreadCount = async (req, res, next) => {
  try {
    const count = await getUnreadCount(req.user.id);
    return success(res, { count }, 'Unread count');
  } catch (err) {
    next(err);
  }
};

/** PUT /api/notifications/:id/read */
const markRead = async (req, res, next) => {
  try {
    const notification = await Notification.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });
    if (!notification) return error(res, 'Notification not found', 404);
    await notification.update({ is_read: true });
    return success(res, { notification }, 'Marked as read');
  } catch (err) {
    next(err);
  }
};

/** PUT /api/notifications/read-all */
const markAllRead = async (req, res, next) => {
  try {
    const [updated] = await Notification.update(
      { is_read: true },
      { where: { user_id: req.user.id, is_read: false } },
    );
    return success(res, { updated }, 'All notifications marked as read');
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/notifications/:id */
const remove = async (req, res, next) => {
  try {
    const deleted = await Notification.destroy({
      where: { id: req.params.id, user_id: req.user.id },
    });
    if (!deleted) return error(res, 'Notification not found', 404);
    return success(res, null, 'Notification deleted');
  } catch (err) {
    next(err);
  }
};

module.exports = { listNotifications, unreadCount, markRead, markAllRead, remove };
