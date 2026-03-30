// server/routes/adminRoutes.js
// ============================================
// Admin Routes — Restricted to admin role
// ============================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');
const {
  getDashboard, getUsers, updateUserStatus, getSystemLogs,
} = require('../controllers/adminController');

// All admin routes require authentication + admin role
router.use(authenticate, adminOnly);

// Dashboard & monitoring
router.get('/dashboard', getDashboard);

// User management
router.get('/users', getUsers);
router.put('/users/:id/status', updateUserStatus);

// System logs
router.get('/logs', getSystemLogs);

module.exports = router;
