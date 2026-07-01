// server/routes/assistantRoutes.js
// ============================================
// Voice Assistant — proactive cross-domain interview surface.
//   GET  /api/assistant/suggestion         → next proactive question (or none)
//   POST /api/assistant/interview/start     → consent gate + first question
//   POST /api/assistant/interview/answer    → log answer, next question or advice
// Isolated from the chat pipeline: no shared controller/route state.
// ============================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  getSuggestion,
  startInterview,
  answerInterview,
  startValidation,
  answerValidation,
} = require('../controllers/assistantController');

router.use(authenticate);

router.get('/suggestion', getSuggestion);
router.post('/interview/start', startValidation, validate, startInterview);
router.post('/interview/answer', answerValidation, validate, answerInterview);

module.exports = router;
