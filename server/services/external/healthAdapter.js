// server/services/external/healthAdapter.js
// ============================================
// Health Platform Adapter Pattern (UR15)
//
// Base interface for Google Fit, Apple HealthKit,
// and future wearable integrations.
// ============================================

/**
 * Abstract base class for external health data providers.
 * All adapters must implement these methods.
 */
class HealthPlatformAdapter {
  constructor(name) {
    if (new.target === HealthPlatformAdapter) {
      throw new Error('Cannot instantiate abstract HealthPlatformAdapter directly');
    }
    this.name = name;
  }

  /** Generate OAuth authorization URL */
  getAuthorizationUrl(userId, redirectUri) {
    throw new Error('getAuthorizationUrl() must be implemented');
  }

  /** Exchange authorization code for tokens */
  async handleCallback(code, redirectUri) {
    throw new Error('handleCallback() must be implemented');
  }

  /** Fetch data from the platform */
  async fetchData(accessToken, dataType, startDate, endDate) {
    throw new Error('fetchData() must be implemented');
  }

  /** Map external data format to LifeSync HealthLog schema */
  mapToHealthLog(externalData, userId) {
    throw new Error('mapToHealthLog() must be implemented');
  }

  /** Refresh expired access token */
  async refreshToken(refreshToken) {
    throw new Error('refreshToken() must be implemented');
  }

  /** Revoke access / disconnect */
  async disconnect(accessToken) {
    throw new Error('disconnect() must be implemented');
  }
}

module.exports = HealthPlatformAdapter;
