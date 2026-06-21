// server/routes/notificationRoutes.js
// ============================================
// Notification Routes — UR9
// ============================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
  remove,
} = require('../controllers/notificationController');

router.use(authenticate);

router.get('/', listNotifications);
router.get('/unread-count', unreadCount);
router.put('/read-all', markAllRead);
router.put('/:id/read', markRead);
router.delete('/:id', remove);

module.exports = router;
