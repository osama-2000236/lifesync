// server/routes/reportRoutes.js
// UC-13 PDF reports + UC-14 notifications

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  listReportsHandler,
  generateReportHandler,
  getReportHandler,
  downloadReportHandler,
  listNotificationsHandler,
  markNotificationReadHandler,
  markAllNotificationsReadHandler,
  updateNotifyPrefsHandler,
  updateNotifyPrefsValidation,
  idValidation,
  runCronHandler,
} = require('../controllers/reportController');

// Cron is unauthenticated but secret-gated (dormant when secret unset).
router.post('/cron/weekly', runCronHandler);

router.use(authenticate);

router.get('/', listReportsHandler);
router.post('/generate', generateReportHandler);
router.get('/notifications', listNotificationsHandler);
router.put('/notifications/read-all', markAllNotificationsReadHandler);
router.put('/notifications/:id/read', idValidation, validate, markNotificationReadHandler);
router.put('/preferences', updateNotifyPrefsValidation, validate, updateNotifyPrefsHandler);
router.get('/:id/download', idValidation, validate, downloadReportHandler);
router.get('/:id', idValidation, validate, getReportHandler);

module.exports = router;
