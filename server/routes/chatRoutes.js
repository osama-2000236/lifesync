// server/routes/chatRoutes.js
// ============================================
// Chat / NLP Processing Routes
// ============================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { processMessage, getChatHistory, getSessions, chatValidation } = require('../controllers/chatController');

// All routes require authentication
router.use(authenticate);

// Send a message for NLP processing
router.post('/', chatValidation, validate, processMessage);

// Get chat history
router.get('/history', getChatHistory);

// List all chat sessions
router.get('/sessions', getSessions);

module.exports = router;
