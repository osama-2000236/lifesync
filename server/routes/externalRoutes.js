// server/routes/externalRoutes.js
// ============================================
// External Health Platform Integration Routes (UR15 / UC-15)
//
// GET  /api/external/connect/:platform    → Get OAuth URL
// GET  /api/external/callback/:platform   → OAuth callback
// POST /api/external/sync/:platform       → Sync data
// POST /api/external/disconnect/:platform → Revoke
// GET  /api/external/status               → Connection status
// ============================================

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const HealthLog = require('../models/HealthLog');
const { UserIntegration } = require('../models');
const { success, error } = require('../utils/responseHelper');
const { createStore } = require('../services/ephemeralStore');
const { frontendUrl, apiPublicUrl } = require('../utils/frontendUrl');

const GoogleFitAdapter = require('../services/external/googleFitAdapter');
const AppleHealthAdapter = require('../services/external/appleHealthAdapter');

const adapters = {
  google_fit: new GoogleFitAdapter(),
  apple_health: new AppleHealthAdapter(),
};

const DEFAULT_GOOGLE_TYPES = ['steps', 'sleep', 'heart_rate', 'calories'];

function getAdapter(platform) {
  const adapter = adapters[platform];
  if (!adapter) {
    const err = new Error(`Unsupported platform: ${platform}. Supported: ${Object.keys(adapters).join(', ')}`);
    err.statusCode = 400;
    err.code = 'UNSUPPORTED_PLATFORM';
    err.isOperational = true;
    throw err;
  }
  return adapter;
}

const callbackRedirectUri = (platform) => (
  `${apiPublicUrl()}/api/external/callback/${platform}`
);

const getTokens = async (userId, platform) => {
  const row = await UserIntegration.findOne({ where: { user_id: userId, platform } });
  if (!row) return null;
  return {
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresIn: row.expires_in,
    tokenExpiresAt: row.token_expires_at,
    connectedAt: row.connected_at,
  };
};

const saveTokens = async (userId, platform, {
  accessToken, refreshToken, expiresIn, tokenExpiresAt,
}) => {
  const existing = await UserIntegration.findOne({ where: { user_id: userId, platform } });
  const fields = {
    access_token: accessToken || null,
    refresh_token: refreshToken || existing?.refresh_token || null,
    expires_in: expiresIn || existing?.expires_in || null,
    token_expires_at: tokenExpiresAt
      || (expiresIn ? new Date(Date.now() + expiresIn * 1000) : existing?.token_expires_at || null),
    connected_at: existing?.connected_at || new Date(),
  };
  // First connect stamps connected_at now; refresh keeps original connected_at.
  if (!existing) fields.connected_at = new Date();
  if (existing) await existing.update(fields);
  else await UserIntegration.create({ user_id: userId, platform, ...fields });
};

const deleteTokens = (userId, platform) => UserIntegration.destroy({ where: { user_id: userId, platform } });

const accessTokenStillValid = (stored) => {
  if (!stored?.accessToken) return false;
  if (stored.tokenExpiresAt) {
    // Refresh 2 minutes before wall-clock expiry.
    return new Date(stored.tokenExpiresAt).getTime() - Date.now() > 120_000;
  }
  // Legacy rows: fall back to connected_at + expires_in.
  if (stored.connectedAt && stored.expiresIn) {
    const deadline = new Date(stored.connectedAt).getTime() + stored.expiresIn * 1000;
    return deadline - Date.now() > 120_000;
  }
  return Boolean(stored.accessToken);
};

/** Ensure a usable access token; refresh if needed. */
const ensureAccessToken = async (userId, platform, adapter) => {
  const stored = await getTokens(userId, platform);
  if (!stored) {
    return { error: 'NOT_CONNECTED', status: 401, message: 'Platform not connected. Please connect first.' };
  }
  if (accessTokenStillValid(stored)) {
    return { accessToken: stored.accessToken, stored };
  }
  if (!stored.refreshToken) {
    return { error: 'RECONNECT', status: 401, message: 'Token expired. Please reconnect.' };
  }
  try {
    const refreshed = await adapter.refreshToken(stored.refreshToken);
    await saveTokens(userId, platform, {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || stored.refreshToken,
      expiresIn: refreshed.expiresIn,
      tokenExpiresAt: refreshed.tokenExpiresAt,
    });
    return { accessToken: refreshed.accessToken, stored, refreshed: true };
  } catch {
    return { error: 'RECONNECT', status: 401, message: 'Token expired. Please reconnect.' };
  }
};

// Pending OAuth states (Redis when configured)
const pendingStates = createStore('oauth_state');
const STATE_TTL_MS = 10 * 60 * 1000;

const issueState = async (userId, platform) => {
  const nonce = crypto.randomBytes(24).toString('base64url');
  await pendingStates.set(nonce, {
    userId,
    platform,
    expiresAt: Date.now() + STATE_TTL_MS,
  }, STATE_TTL_MS);
  return nonce;
};

const consumeState = async (nonce, platform) => {
  if (!nonce) return null;
  const entry = await pendingStates.get(nonce);
  if (!entry) return null;
  await pendingStates.del(nonce);
  if (entry.expiresAt <= Date.now() || entry.platform !== platform) return null;
  return entry;
};

// ─── Get OAuth Authorization URL ───
router.get('/connect/:platform', authenticate, async (req, res, next) => {
  try {
    const adapter = getAdapter(req.params.platform);
    const redirectUri = callbackRedirectUri(req.params.platform);
    const state = await issueState(req.user.id, req.params.platform);
    const result = adapter.getAuthorizationUrl(state, redirectUri);

    if (typeof result === 'string') {
      success(res, {
        url: result,
        platform: req.params.platform,
        redirect_uri: redirectUri,
      }, 'Authorization URL generated');
    } else {
      success(res, result, 'Native authorization required');
    }
  } catch (err) {
    if (err.statusCode && err.isOperational) {
      return error(res, err.message, err.statusCode, err.code || 'EXTERNAL_ERROR');
    }
    next(err);
  }
});

// ─── OAuth Callback (Google Fit) ───
router.get('/callback/:platform', async (req, res, next) => {
  const fe = frontendUrl();
  try {
    const { code, state, error: oauthError } = req.query;
    if (oauthError) {
      return res.redirect(`${fe}/integrations?integration=${req.params.platform}&status=denied&error=${encodeURIComponent(String(oauthError))}`);
    }
    if (!code) {
      return res.redirect(`${fe}/integrations?integration=${req.params.platform}&status=error&error=missing_code`);
    }

    const pending = await consumeState(String(state || ''), req.params.platform);
    if (!pending) {
      return res.redirect(`${fe}/integrations?integration=${req.params.platform}&status=error&error=invalid_state`);
    }

    const adapter = getAdapter(req.params.platform);
    const redirectUri = callbackRedirectUri(req.params.platform);
    const tokens = await adapter.handleCallback(code, redirectUri);
    await saveTokens(pending.userId, req.params.platform, tokens);

    res.redirect(`${fe}/integrations?integration=${req.params.platform}&status=connected`);
  } catch (err) {
    // Never log tokens/code; message only.
    console.error('[external/callback]', err.code || err.name || 'Error', String(err.message || '').slice(0, 120));
    res.redirect(`${fe}/integrations?integration=${req.params.platform}&status=error&error=callback_failed`);
  }
});

// ─── Sync Data from Platform ───
router.post('/sync/:platform', authenticate, async (req, res, next) => {
  try {
    const adapter = getAdapter(req.params.platform);
    const userId = req.user.id;
    const {
      dataTypes = DEFAULT_GOOGLE_TYPES,
      days = 7,
      payload,
    } = req.body || {};

    const dayCount = Math.min(90, Math.max(1, parseInt(days, 10) || 7));
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - dayCount * 24 * 60 * 60 * 1000);

    let allEntries = [];

    if (req.params.platform === 'apple_health' && payload) {
      const normalized = await adapter.fetchData(null, null, payload);
      allEntries = adapter.mapToHealthLog(normalized, userId);
    } else {
      const ensured = await ensureAccessToken(userId, req.params.platform, adapter);
      if (ensured.error) {
        return error(res, ensured.message, ensured.status, ensured.error);
      }

      const types = Array.isArray(dataTypes) && dataTypes.length
        ? dataTypes
        : DEFAULT_GOOGLE_TYPES;

      const errors = [];
      for (const type of types) {
        try {
          const rawData = await adapter.fetchData(ensured.accessToken, type, startDate, endDate);
          const mapped = adapter.mapToHealthLog(rawData, userId);
          allEntries.push(...mapped);
        } catch (typeErr) {
          errors.push({ type, message: typeErr.message });
        }
      }
      if (!allEntries.length && errors.length) {
        return error(res, `Sync failed: ${errors.map((e) => e.type).join(', ')}`, 502, 'SYNC_PARTIAL_FAIL');
      }
    }

    // Dedupe by user + type + day + source (idempotent re-sync).
    let createdCount = 0;
    for (const entry of allEntries) {
      const [, wasCreated] = await HealthLog.findOrCreate({
        where: {
          user_id: entry.user_id,
          type: entry.type,
          logged_at: entry.logged_at,
          source: entry.source,
        },
        defaults: entry,
      });
      if (wasCreated) createdCount += 1;
    }

    success(res, {
      total_received: allEntries.length,
      new_entries: createdCount,
      duplicates_skipped: allEntries.length - createdCount,
      platform: req.params.platform,
      window_days: dayCount,
    }, `Synced ${createdCount} new entries from ${req.params.platform}`);
  } catch (err) {
    if (err.statusCode && err.isOperational) {
      return error(res, err.message, err.statusCode, err.code || 'EXTERNAL_ERROR');
    }
    next(err);
  }
});

// ─── Disconnect Platform ───
router.post('/disconnect/:platform', authenticate, async (req, res, next) => {
  try {
    const adapter = getAdapter(req.params.platform);
    const stored = await getTokens(req.user.id, req.params.platform);

    if (stored?.accessToken) {
      try { await adapter.disconnect(stored.accessToken); } catch (e) { /* ignore revocation errors */ }
    }

    await deleteTokens(req.user.id, req.params.platform);
    success(res, null, `Disconnected from ${req.params.platform}`);
  } catch (err) {
    next(err);
  }
});

// ─── Connection Status ───
router.get('/status', authenticate, async (req, res, next) => {
  try {
    const rows = await UserIntegration.findAll({ where: { user_id: req.user.id } });
    const byPlatform = new Map(rows.map((r) => [r.platform, r]));
    const platforms = {};
    for (const key of Object.keys(adapters)) {
      const stored = byPlatform.get(key);
      const adapter = adapters[key];
      const configured = typeof adapter.isConfigured === 'function'
        ? adapter.isConfigured()
        : true;
      const tokenValid = stored
        ? accessTokenStillValid({
          accessToken: stored.access_token,
          refreshToken: stored.refresh_token,
          expiresIn: stored.expires_in,
          tokenExpiresAt: stored.token_expires_at,
          connectedAt: stored.connected_at,
        })
        : false;
      const callbackUri = callbackRedirectUri(key);
      const setup = typeof adapter.getSetupStatus === 'function'
        ? adapter.getSetupStatus(callbackUri)
        : { configured, callback_uri: callbackUri };
      platforms[key] = {
        connected: !!stored,
        connectedAt: stored?.connected_at || null,
        configured,
        needs_reconnect: Boolean(stored && !tokenValid && !stored.refresh_token),
        // refresh available means client can still try sync (server will refresh)
        can_sync: Boolean(stored && (tokenValid || stored.refresh_token)),
        setup,
      };
    }
    success(res, {
      platforms,
      callback_base: apiPublicUrl(),
    }, 'Integration status');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
// Test hooks
module.exports._accessTokenStillValid = accessTokenStillValid;
module.exports._ensureAccessToken = ensureAccessToken;
