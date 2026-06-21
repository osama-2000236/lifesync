const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getAIProviderStatus } = require('../services/ai/providerClient');
const {
  getRuntimeSnapshot,
  getModelCatalog,
  startModel,
} = require('../services/ai/modelRuntimeManager');
const { success } = require('../utils/responseHelper');

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
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
