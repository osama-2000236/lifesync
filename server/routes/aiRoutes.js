const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getAIProviderStatus } = require('../services/ai/providerClient');
const {
  getRuntimeSnapshot,
  getModelCatalog,
  startModel,
  registerCustomModel,
  getCustomModelState,
} = require('../services/ai/modelRuntimeManager');
const { success, error } = require('../utils/responseHelper');

const router = express.Router();

// Selectable model menu (BERT default + local Gemma options).
router.get('/models', authenticate, (req, res) => success(res, { models: getModelCatalog() }, 'Model catalog'));

router.get('/status', authenticate, async (req, res, next) => {
  try {
    const [runtime, insights] = await Promise.all([
      getRuntimeSnapshot(),
      getAIProviderStatus('insights'),
    ]);
    return success(res, { chat: runtime.active, insights, runtime }, 'AI provider status');
  } catch (error) {
    return next(error);
  }
});

router.post('/start', authenticate, async (req, res, next) => {
  try {
    // Accept the picker's model id (preferred) or legacy `provider` field.
    const requested = String(req.body?.model || req.body?.provider || 'bert_local').trim().toLowerCase();
    const activation = await startModel(requested);
    return success(res, { activation }, 'AI activation started', 202);
  } catch (err) {
    return next(err);
  }
});

// Register a user-supplied custom model (from the upload button or an
// OpenAI-compatible endpoint). The heavy model file stays on the local runtime
// (LM Studio / Ollama), which loads it on the GPU automatically (CPU fallback).
router.post('/custom-model', authenticate, (req, res, next) => {
  try {
    const { name, runtime, endpoint, fileName } = req.body || {};
    if (!name && !endpoint && !fileName) {
      return error(res, 'Pick a model file or enter an OpenAI-compatible endpoint.', 400, 'CUSTOM_MODEL_INVALID');
    }
    const state = registerCustomModel({ name: name || fileName, runtime, endpoint, fileName });
    return success(res, { custom_model: state, models: getModelCatalog() }, 'Custom model registered. Select it to start.');
  } catch (err) {
    return error(res, err.message, 400, 'CUSTOM_MODEL_INVALID');
  }
});

router.get('/custom-model', authenticate, (req, res) => success(res, { custom_model: getCustomModelState() }, 'Custom model state'));

module.exports = router;
