// server/routes/externalRoutes.js
// ============================================
// External Health Platform Integration Routes (UR15)
//
// GET  /api/external/connect/:platform    → Get OAuth URL
// GET  /api/external/callback/:platform   → OAuth callback
// POST /api/external/sync/:platform       → Sync data
// POST /api/external/disconnect/:platform → Revoke
// GET  /api/external/status               → Connection status
// ============================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const HealthLog = require('../models/HealthLog');
const { success, error } = require('../utils/responseHelper');

const GoogleFitAdapter = require('../services/external/googleFitAdapter');
const AppleHealthAdapter = require('../services/external/appleHealthAdapter');

// Adapter registry
const adapters = {
  google_fit: new GoogleFitAdapter(),
  apple_health: new AppleHealthAdapter(),
};

function getAdapter(platform) {
  const adapter = adapters[platform];
  if (!adapter) throw new Error(`Unsupported platform: ${platform}. Supported: ${Object.keys(adapters).join(', ')}`);
  return adapter;
}

// In-memory token store (production: use DB table `user_integrations`)
const tokenStore = new Map();

// ─── Get OAuth Authorization URL ───
router.get('/connect/:platform', authenticate, async (req, res, next) => {
  try {
    const adapter = getAdapter(req.params.platform);
    const redirectUri = `${process.env.APP_URL || 'http://localhost:5000'}/api/external/callback/${req.params.platform}`;
    const result = adapter.getAuthorizationUrl(req.user.id, redirectUri);

    if (typeof result === 'string') {
      success(res, { url: result, platform: req.params.platform }, 'Authorization URL generated');
    } else {
      // Apple HealthKit returns instructions instead of URL
      success(res, result, 'Native authorization required');
    }
  } catch (err) {
    next(err);
  }
});

// ─── OAuth Callback (Google Fit) ───
router.get('/callback/:platform', async (req, res, next) => {
  try {
    const { code, state } = req.query;
    if (!code) return error(res, 'Missing authorization code', 400);

    const adapter = getAdapter(req.params.platform);
    const redirectUri = `${process.env.APP_URL || 'http://localhost:5000'}/api/external/callback/${req.params.platform}`;
    const tokens = await adapter.handleCallback(code, redirectUri);

    // Parse user ID from state
    const { userId } = JSON.parse(state || '{}');
    if (!userId) return error(res, 'Invalid state parameter', 400);

    // Store tokens (production: persist to DB)
    tokenStore.set(`${userId}:${req.params.platform}`, {
      ...tokens,
      connectedAt: new Date().toISOString(),
    });

    // Redirect to frontend success page
    res.redirect(`${process.env.CORS_ORIGIN || 'http://localhost:5173'}/dashboard?integration=${req.params.platform}&status=connected`);
  } catch (err) {
    next(err);
  }
});

// ─── Sync Data from Platform ───
router.post('/sync/:platform', authenticate, async (req, res, next) => {
  try {
    const adapter = getAdapter(req.params.platform);
    const userId = req.user.id;
    const { dataTypes = ['steps', 'calories'], days = 7, payload } = req.body;

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    let allEntries = [];

    if (req.params.platform === 'apple_health' && payload) {
      // Apple Health: receive pre-fetched data from mobile app
      const normalized = await adapter.fetchData(null, null, payload);
      allEntries = adapter.mapToHealthLog(normalized, userId);
    } else {
      // Google Fit: fetch via API using stored tokens
      const stored = tokenStore.get(`${userId}:${req.params.platform}`);
      if (!stored) return error(res, 'Platform not connected. Please connect first.', 401);

      let { accessToken } = stored;

      // Refresh if needed (tokens expire in 1 hour)
      const connectedTime = new Date(stored.connectedAt).getTime();
      const elapsed = Date.now() - connectedTime;
      if (elapsed > (stored.expiresIn || 3600) * 1000 * 0.9) {
        try {
          const refreshed = await adapter.refreshToken(stored.refreshToken);
          accessToken = refreshed.accessToken;
          tokenStore.set(`${userId}:${req.params.platform}`, {
            ...stored,
            accessToken,
            connectedAt: new Date().toISOString(),
          });
        } catch (refreshErr) {
          return error(res, 'Token expired. Please reconnect.', 401);
        }
      }

      for (const type of dataTypes) {
        const rawData = await adapter.fetchData(accessToken, type, startDate, endDate);
        const mapped = adapter.mapToHealthLog(rawData, userId);
        allEntries.push(...mapped);
      }
    }

    // Bulk insert, skipping duplicates (same user + type + date)
    let createdCount = 0;
    for (const entry of allEntries) {
      const [_, wasCreated] = await HealthLog.findOrCreate({
        where: {
          user_id: entry.user_id,
          type: entry.type,
          logged_at: entry.logged_at,
          source: entry.source,
        },
        defaults: entry,
      });
      if (wasCreated) createdCount++;
    }

    success(res, {
      total_received: allEntries.length,
      new_entries: createdCount,
      duplicates_skipped: allEntries.length - createdCount,
      platform: req.params.platform,
    }, `Synced ${createdCount} new entries from ${req.params.platform}`);
  } catch (err) {
    next(err);
  }
});

// ─── Disconnect Platform ───
router.post('/disconnect/:platform', authenticate, async (req, res, next) => {
  try {
    const adapter = getAdapter(req.params.platform);
    const stored = tokenStore.get(`${req.user.id}:${req.params.platform}`);

    if (stored?.accessToken) {
      try { await adapter.disconnect(stored.accessToken); } catch (e) { /* ignore revocation errors */ }
    }

    tokenStore.delete(`${req.user.id}:${req.params.platform}`);
    success(res, null, `Disconnected from ${req.params.platform}`);
  } catch (err) {
    next(err);
  }
});

// ─── Connection Status ───
router.get('/status', authenticate, async (req, res) => {
  const platforms = {};
  for (const key of Object.keys(adapters)) {
    const stored = tokenStore.get(`${req.user.id}:${key}`);
    platforms[key] = {
      connected: !!stored,
      connectedAt: stored?.connectedAt || null,
    };
  }
  success(res, { platforms }, 'Integration status');
});

module.exports = router;
