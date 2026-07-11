// server/controllers/memoryController.js
// ============================================
// User Memory control plane — list / correct / delete the facts the
// assistant remembers, so memory is trusted instead of a black box.
// Thin: all Sequelize lives in memoryService.
// ============================================

const { body, param } = require('express-validator');
const {
  listMemories,
  updateMemory,
  deleteMemory,
  clearMemories,
} = require('../services/ai/memoryService');
const { success, error } = require('../utils/responseHelper');

const idValidation = [
  param('id').isInt({ min: 1 }).withMessage('Memory id must be a positive integer.'),
];

const updateValidation = [
  ...idValidation,
  body('value').trim().isLength({ min: 1, max: 240 })
    .withMessage('Value must be 1-240 characters.'),
];

const list = async (req, res, next) => {
  try {
    const memories = await listMemories(req.user.id);
    success(res, { memories, count: memories.length }, 'Remembered facts');
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const memory = await updateMemory(req.user.id, req.params.id, req.body.value);
    if (memory && memory.error === 'invalid_value') {
      return error(res, 'Value rejected after sanitization.', 400, 'INVALID_VALUE');
    }
    if (!memory) return error(res, 'Memory not found', 404);
    success(res, { memory }, 'Memory updated');
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const deleted = await deleteMemory(req.user.id, req.params.id);
    if (!deleted) return error(res, 'Memory not found', 404);
    success(res, { deleted: true }, 'Memory deleted');
  } catch (err) {
    next(err);
  }
};

const clear = async (req, res, next) => {
  try {
    const count = await clearMemories(req.user.id);
    success(res, { deleted: count }, 'Memory cleared');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  list, update, remove, clear, idValidation, updateValidation,
};
