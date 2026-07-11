// server/routes/memoryRoutes.js
// ============================================
// User Memory control plane.
//   GET    /api/memory      → list remembered facts (never assistant.%)
//   PUT    /api/memory/:id  → correct a fact (source becomes 'user')
//   DELETE /api/memory/:id  → forget one fact
//   DELETE /api/memory      → forget everything (privacy wipe)
// ============================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  list, update, remove, clear, idValidation, updateValidation,
} = require('../controllers/memoryController');

router.use(authenticate);

router.get('/', list);
router.put('/:id', updateValidation, validate, update);
router.delete('/:id', idValidation, validate, remove);
router.delete('/', clear);

module.exports = router;
