// server/routes/reportRoutes.js
// ============================================
// Report Routes — UR12
// ============================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  generateReport,
  listReports,
  getReport,
  downloadReport,
  deleteReport,
} = require('../controllers/reportController');

router.use(authenticate);

router.post('/generate', generateReport);
router.get('/', listReports);
router.get('/:id/download', downloadReport);
router.get('/:id', getReport);
router.delete('/:id', deleteReport);

module.exports = router;
