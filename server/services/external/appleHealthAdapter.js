// server/services/external/appleHealthAdapter.js
// ============================================
// Apple HealthKit Integration Adapter (UR15)
//
// NOTE: Apple HealthKit requires a native iOS/macOS
// application to read data. This adapter is designed
// as a bridge receiver — the mobile app reads HealthKit
// and POSTs to our sync endpoint.
// ============================================

const HealthPlatformAdapter = require('./healthAdapter');

class AppleHealthAdapter extends HealthPlatformAdapter {
  constructor() {
    super('apple_health');
  }

  /**
   * HealthKit uses native iOS SDK for auth — no OAuth URL.
   * The mobile app handles permissions directly.
   */
  getAuthorizationUrl() {
    return {
      type: 'native_sdk',
      message: 'Apple HealthKit authorization is handled by the iOS app. ' +
        'Grant permissions in Settings > Health > Data Access.',
      required_permissions: [
        'HKQuantityTypeIdentifierStepCount',
        'HKQuantityTypeIdentifierActiveEnergyBurned',
        'HKCategoryTypeIdentifierSleepAnalysis',
        'HKQuantityTypeIdentifierHeartRate',
        'HKQuantityTypeIdentifierDietaryWater',
      ],
    };
  }

  /**
   * No OAuth callback for HealthKit.
   * The mobile app POSTs data directly to /api/external/sync
   */
  async handleCallback() {
    throw new Error('Apple HealthKit does not use OAuth callbacks. Use the sync endpoint instead.');
  }

  async refreshToken() {
    return { message: 'Not applicable for Apple HealthKit' };
  }

  async disconnect() {
    return { success: true, message: 'Revoke in iOS Settings > Health' };
  }

  /**
   * HealthKit data is received from the mobile app, not fetched.
   * This method validates and normalizes the incoming payload.
   */
  async fetchData(_, dataType, payload) {
    // payload expected from mobile app:
    // [{ type: 'steps', value: 8500, date: '2025-12-01', startDate, endDate }]
    if (!Array.isArray(payload)) {
      throw new Error('Expected array of health data points from mobile app');
    }

    return payload
      .filter((p) => p.type && p.value !== undefined && p.date)
      .map((p) => ({
        type: p.type,
        value: Number(p.value),
        duration: p.duration || null,
        date: p.date,
        source: 'apple_health',
        raw: { startDate: p.startDate, endDate: p.endDate },
      }));
  }

  /**
   * Map HealthKit data to LifeSync HealthLog records
   */
  mapToHealthLog(externalData, userId) {
    const typeMap = {
      stepCount: 'steps',
      activeEnergyBurned: 'exercise',
      sleepAnalysis: 'sleep',
      heartRate: 'heart_rate',
      dietaryWater: 'water',
      steps: 'steps',
      calories: 'nutrition',
      sleep: 'sleep',
      heart_rate: 'heart_rate',
      water: 'water',
    };

    return externalData.map((entry) => ({
      user_id: userId,
      type: typeMap[entry.type] || entry.type,
      value: entry.value,
      value_text: `${entry.value} (synced from Apple Health)`,
      duration: entry.duration,
      logged_at: new Date(entry.date),
      source: 'apple_health',
      notes: 'Auto-synced from Apple Health',
      confidence: 1.0,
    }));
  }
}

module.exports = AppleHealthAdapter;
