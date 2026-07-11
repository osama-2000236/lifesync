// server/services/external/googleFitAdapter.js
// ============================================
// Google Fit Integration Adapter (UR15)
//
// OAuth2 flow → fetch Steps, Calories, Sleep →
// map to HealthLog entries for LifeSync.
//
// Requires: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// in .env
// ============================================

const axios = require('axios');
const HealthPlatformAdapter = require('./healthAdapter');

// Google Fit API scopes
const SCOPES = [
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/fitness.body.read',
  'https://www.googleapis.com/auth/fitness.sleep.read',
  'https://www.googleapis.com/auth/fitness.nutrition.read',
];

// Google Fit data source IDs
const DATA_SOURCES = {
  steps: 'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps',
  calories: 'derived:com.google.calories.expended:com.google.android.gms:merge_calories_expended',
  heart_rate: 'derived:com.google.heart_rate.bpm:com.google.android.gms:merge_heart_rate_bpm',
  sleep: 'derived:com.google.sleep.segment:com.google.android.gms:merged',
};

/**
 * Reject empty / template / example env values so "configured" is honest.
 * Never logs the raw secret.
 */
const looksLikeRealCredential = (value, { kind = 'any' } = {}) => {
  const v = String(value || '').trim();
  if (!v || v.length < 12) return false;
  if (/^(your[_-]?|change[_-]?me|placeholder|example|xxx+|todo|fix[_-]?secret)/i.test(v)) {
    return false;
  }
  if (kind === 'client_id') {
    // Google OAuth web client IDs end with this suffix.
    return /\.apps\.googleusercontent\.com$/i.test(v);
  }
  if (kind === 'client_secret') {
    // Modern Google secrets often start with GOCSPX-; also accept long opaque secrets.
    return v.startsWith('GOCSPX-') || v.length >= 20;
  }
  return true;
};

const firstAuthClientId = () => String(process.env.GOOGLE_AUTH_CLIENT_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => looksLikeRealCredential(s, { kind: 'client_id' }))[0] || '';

class GoogleFitAdapter extends HealthPlatformAdapter {
  constructor() {
    super('google_fit');
    // Prefer dedicated Fit OAuth client; fall back to the first real Google Sign-In
    // web client id when GOOGLE_CLIENT_ID is unset/placeholder.
    const dedicated = looksLikeRealCredential(process.env.GOOGLE_CLIENT_ID, { kind: 'client_id' })
      ? String(process.env.GOOGLE_CLIENT_ID).trim()
      : '';
    this.clientId = dedicated || firstAuthClientId();
    this.clientSecret = looksLikeRealCredential(process.env.GOOGLE_CLIENT_SECRET, { kind: 'client_secret' })
      ? String(process.env.GOOGLE_CLIENT_SECRET).trim()
      : '';
    this.tokenUrl = 'https://oauth2.googleapis.com/token';
    this.authUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
    this.apiBase = 'https://www.googleapis.com/fitness/v1/users/me';
  }

  // ────────────────────────────────────────
  // OAuth2 Flow
  // ────────────────────────────────────────

  /**
   * True when non-placeholder OAuth client credentials are present.
   * Does not prove Google Console redirect URIs are correct.
   */
  isConfigured() {
    return Boolean(this.clientId && this.clientSecret);
  }

  /**
   * Secret-free setup snapshot for status/admin UIs.
   * @param {string} [callbackUri]
   */
  getSetupStatus(callbackUri) {
    const envClientRaw = String(process.env.GOOGLE_CLIENT_ID || '').trim();
    const envSecretRaw = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
    return {
      configured: this.isConfigured(),
      has_client_id: Boolean(this.clientId),
      has_client_secret: Boolean(this.clientSecret),
      client_id_source: this.clientId
        ? (looksLikeRealCredential(envClientRaw, { kind: 'client_id' }) ? 'GOOGLE_CLIENT_ID' : 'GOOGLE_AUTH_CLIENT_IDS')
        : null,
      env_client_id_placeholder: Boolean(envClientRaw) && !looksLikeRealCredential(envClientRaw, { kind: 'client_id' }),
      env_secret_placeholder: Boolean(envSecretRaw) && !looksLikeRealCredential(envSecretRaw, { kind: 'client_secret' }),
      callback_uri: callbackUri || null,
      missing: [
        !this.clientId ? 'client_id' : null,
        !this.clientSecret ? 'client_secret' : null,
      ].filter(Boolean),
    };
  }

  assertConfigured() {
    if (!this.isConfigured()) {
      const setup = this.getSetupStatus();
      const detail = setup.missing.length
        ? `Missing: ${setup.missing.join(', ')}.`
        : 'Credentials look like placeholders.';
      const err = new Error(
        'Google Fit is not configured. Set real GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET '
        + `(not template values) on the server, and register the OAuth callback URL in Google Cloud Console. ${detail}`,
      );
      err.statusCode = 503;
      err.code = 'GOOGLE_FIT_NOT_CONFIGURED';
      err.isOperational = true;
      err.setup = setup;
      throw err;
    }
  }

  getAuthorizationUrl(state, redirectUri) {
    this.assertConfigured();
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state: String(state),
    });

    return `${this.authUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access + refresh tokens
   */
  async handleCallback(code, redirectUri) {
    this.assertConfigured();
    const { data } = await axios.post(this.tokenUrl, {
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const expiresIn = data.expires_in || 3600;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn,
      tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  /**
   * Refresh expired access token
   */
  async refreshToken(refreshToken) {
    this.assertConfigured();
    if (!refreshToken) {
      const err = new Error('No refresh token stored. Please reconnect Google Fit.');
      err.statusCode = 401;
      err.code = 'GOOGLE_FIT_RECONNECT';
      err.isOperational = true;
      throw err;
    }
    const { data } = await axios.post(this.tokenUrl, {
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
    });

    const expiresIn = data.expires_in || 3600;
    return {
      accessToken: data.access_token,
      expiresIn,
      tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      // Google usually omits refresh_token on refresh.
      refreshToken: data.refresh_token || refreshToken,
    };
  }

  /**
   * Revoke Google Fit access.
   * Token goes in the form body — never the URL (query strings hit access logs,
   * reverse proxies, and browser history).
   */
  async disconnect(accessToken) {
    if (!accessToken) return { success: true };
    await axios.post(
      'https://oauth2.googleapis.com/revoke',
      new URLSearchParams({ token: String(accessToken) }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15_000 },
    );
    return { success: true };
  }

  // ────────────────────────────────────────
  // Data Fetching
  // ────────────────────────────────────────

  /**
   * Fetch data from Google Fit API
   * @param {string} accessToken
   * @param {string} dataType - 'steps' | 'calories' | 'heart_rate' | 'sleep'
   * @param {Date} startDate
   * @param {Date} endDate
   */
  async fetchData(accessToken, dataType, startDate, endDate) {
    const startTimeNanos = startDate.getTime() * 1e6;
    const endTimeNanos = endDate.getTime() * 1e6;

    if (dataType === 'sleep') {
      return this._fetchSleepSessions(accessToken, startDate, endDate);
    }

    const dataSourceId = DATA_SOURCES[dataType];
    if (!dataSourceId) {
      throw new Error(`Unsupported data type: ${dataType}`);
    }

    // Use aggregate endpoint for steps and calories
    const { data } = await axios.post(
      `${this.apiBase}/dataset:aggregate`,
      {
        aggregateBy: [{ dataSourceId }],
        bucketByTime: { durationMillis: 86400000 }, // 1 day
        startTimeMillis: startDate.getTime(),
        endTimeMillis: endDate.getTime(),
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    return this._parseAggregateResponse(data, dataType);
  }

  /**
   * Fetch sleep sessions separately (uses Sessions API)
   */
  async _fetchSleepSessions(accessToken, startDate, endDate) {
    const { data } = await axios.get(
      `${this.apiBase}/sessions`, {
        params: {
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
          activityType: 72, // Sleep activity type
        },
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    return (data.session || []).map((session) => {
      const startMs = parseInt(session.startTimeMillis);
      const endMs = parseInt(session.endTimeMillis);
      const durationHours = (endMs - startMs) / (1000 * 60 * 60);

      return {
        type: 'sleep',
        value: Math.round(durationHours * 10) / 10,
        duration: Math.round((endMs - startMs) / 60000), // minutes
        date: new Date(startMs).toISOString().slice(0, 10),
        source: 'google_fit',
        raw: { sessionId: session.id, name: session.name },
      };
    });
  }

  /**
   * Parse Google Fit aggregate response into normalized format
   */
  _parseAggregateResponse(response, dataType) {
    const results = [];

    (response.bucket || []).forEach((bucket) => {
      const startDate = new Date(parseInt(bucket.startTimeMillis));
      const date = startDate.toISOString().slice(0, 10);

      (bucket.dataset || []).forEach((ds) => {
        (ds.point || []).forEach((point) => {
          const values = point.value || [];
          let value = 0;

          if (dataType === 'steps') {
            value = values[0]?.intVal || 0;
          } else if (dataType === 'calories') {
            value = Math.round((values[0]?.fpVal || 0) * 10) / 10;
          } else if (dataType === 'heart_rate') {
            value = Math.round((values[0]?.fpVal || 0) * 10) / 10;
          }

          results.push({
            type: dataType,
            value,
            date,
            source: 'google_fit',
          });
        });
      });
    });

    return results;
  }

  // ────────────────────────────────────────
  // Data Mapping to HealthLog
  // ────────────────────────────────────────

  /**
   * Map Google Fit data to LifeSync HealthLog records
   * @param {Array} externalData - Output from fetchData()
   * @param {number} userId
   * @returns {Array} HealthLog-compatible objects
   */
  mapToHealthLog(externalData, userId) {
    return externalData.map((entry) => {
      const mapped = {
        user_id: userId,
        type: this._mapType(entry.type),
        value: entry.value,
        value_text: `${entry.value} (synced from Google Fit)`,
        logged_at: new Date(entry.date),
        source: 'google_fit',
        notes: `Auto-synced from Google Fit`,
        confidence: 1.0,
      };

      if (entry.duration) {
        mapped.duration = entry.duration;
      }

      return mapped;
    });
  }

  /**
   * Map Google Fit types to LifeSync health types
   */
  _mapType(googleType) {
    const typeMap = {
      steps: 'steps',
      calories: 'nutrition',
      heart_rate: 'heart_rate',
      sleep: 'sleep',
    };
    return typeMap[googleType] || 'exercise';
  }
}

module.exports = GoogleFitAdapter;
