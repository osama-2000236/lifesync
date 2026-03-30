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

class GoogleFitAdapter extends HealthPlatformAdapter {
  constructor() {
    super('google_fit');
    this.clientId = process.env.GOOGLE_CLIENT_ID;
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    this.tokenUrl = 'https://oauth2.googleapis.com/token';
    this.authUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
    this.apiBase = 'https://www.googleapis.com/fitness/v1/users/me';
  }

  // ────────────────────────────────────────
  // OAuth2 Flow
  // ────────────────────────────────────────

  /**
   * Generate Google OAuth consent URL
   * @param {number} userId - Stored in state param for callback
   * @param {string} redirectUri - Must match Google Console config
   */
  getAuthorizationUrl(userId, redirectUri) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state: JSON.stringify({ userId, platform: 'google_fit' }),
    });

    return `${this.authUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access + refresh tokens
   */
  async handleCallback(code, redirectUri) {
    const { data } = await axios.post(this.tokenUrl, {
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  /**
   * Refresh expired access token
   */
  async refreshToken(refreshToken) {
    const { data } = await axios.post(this.tokenUrl, {
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
    });

    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Revoke Google Fit access
   */
  async disconnect(accessToken) {
    await axios.post(`https://oauth2.googleapis.com/revoke?token=${accessToken}`);
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
