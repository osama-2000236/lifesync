const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getAIProviderStatus } = require('../services/ai/providerClient');
const { getRuntimeSnapshot, startBestAvailableModel } = require('../services/ai/modelRuntimeManager');
const { success } = require('../utils/responseHelper');

const router = express.Router();

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
    const provider = String(req.body?.provider || 'auto').trim().toLowerCase();
    const activation = await startBestAvailableModel(provider);
    return success(res, { activation }, 'AI activation started', 202);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
