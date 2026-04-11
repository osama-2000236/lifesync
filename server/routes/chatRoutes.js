// server/routes/chatRoutes.js
// ============================================
// Chat / NLP Processing Routes
// ============================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { processMessage, processMessageStream, getChatHistory, getSessions, chatValidation } = require('../controllers/chatController');

// All routes require authentication
router.use(authenticate);

// SSE streaming endpoint (primary — used by updated frontend)
router.post('/stream', chatValidation, validate, processMessageStream);

// Original JSON endpoint (backwards compatible)
router.post('/', chatValidation, validate, processMessage);

// Get chat history
router.get('/history', getChatHistory);

// List all chat sessions
router.get('/sessions', getSessions);

module.exports = router;
