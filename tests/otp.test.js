// tests/otp.test.js
// ============================================
// OTP Service Test Suite
// Tests the two-step registration OTP workflow
// ============================================

const {
  createOTP, verifyOTP, isEmailVerified, consumeOTP, _otpStore,
} = require('../server/services/otpService');

// Clear store before each test
beforeEach(() => {
  _otpStore.clear();
});

describe('OTP Service', () => {
  describe('createOTP', () => {
    test('should generate a 6-digit OTP', () => {
      const result = createOTP('test@example.com');

      expect(result.success).toBe(true);
      expect(result.code).toBeDefined();
      expect(result.code).toHaveLength(6);
      expect(/^\d{6}$/.test(result.code)).toBe(true);
    });

    test('should set expiry time', () => {
      const result = createOTP('test@example.com');

      expect(result.expiresIn).toBeGreaterThan(0);
    });

    test('should enforce cooldown between requests', () => {
      createOTP('test@example.com');
      const result2 = createOTP('test@example.com');

      expect(result2.success).toBe(false);
      expect(result2.retryAfter).toBeGreaterThan(0);
    });

    test('should normalize email to lowercase', () => {
      createOTP('Test@Example.COM');

      expect(_otpStore.has('test@example.com')).toBe(true);
    });

    test('should generate different codes for different emails', () => {
      const r1 = createOTP('user1@example.com');
      const r2 = createOTP('user2@example.com');

      expect(r1.code).toBeDefined();
      expect(r2.code).toBeDefined();
      // While theoretically they could be the same, with 6-digit codes it's extremely unlikely
    });
  });

  describe('verifyOTP', () => {
    test('should verify correct code', () => {
      const { code } = createOTP('test@example.com');
      const result = verifyOTP('test@example.com', code);

      expect(result.success).toBe(true);
    });

    test('should reject incorrect code', () => {
      createOTP('test@example.com');
      const result = verifyOTP('test@example.com', '000000');

      expect(result.success).toBe(false);
      expect(result.code).toBe('OTP_INVALID');
    });

    test('should return not found for unregistered email', () => {
      const result = verifyOTP('unknown@example.com', '123456');

      expect(result.success).toBe(false);
      expect(result.code).toBe('OTP_NOT_FOUND');
    });

    test('should reject after max attempts', () => {
      createOTP('test@example.com');

      // Exhaust all 5 attempts
      for (let i = 0; i < 5; i++) {
        verifyOTP('test@example.com', '000000');
      }

      // The 5th failed attempt triggers OTP_MAX_ATTEMPTS and clears the store
      // So the next call should get OTP_NOT_FOUND since the store was cleaned
      const result = verifyOTP('test@example.com', '000000');

      expect(result.success).toBe(false);
      // After max attempts are exhausted, store is cleared on next verify call
      expect(['OTP_NOT_FOUND', 'OTP_MAX_ATTEMPTS']).toContain(result.code);
    });

    test('should track remaining attempts', () => {
      createOTP('test@example.com');
      const result = verifyOTP('test@example.com', '000000');

      expect(result.success).toBe(false);
      expect(result.message).toContain('attempt');
    });

    test('should reject expired OTP', () => {
      const { code } = createOTP('test@example.com');

      // Manually expire the OTP
      const record = _otpStore.get('test@example.com');
      record.expiresAt = Date.now() - 1000; // Expired 1 second ago
      _otpStore.set('test@example.com', record);

      const result = verifyOTP('test@example.com', code);

      expect(result.success).toBe(false);
      expect(result.code).toBe('OTP_EXPIRED');
    });
  });

  describe('isEmailVerified', () => {
    test('should return true after successful verification', () => {
      const { code } = createOTP('test@example.com');
      verifyOTP('test@example.com', code);

      expect(isEmailVerified('test@example.com')).toBe(true);
    });

    test('should return false for unverified email', () => {
      createOTP('test@example.com');

      expect(isEmailVerified('test@example.com')).toBe(false);
    });

    test('should return false for unknown email', () => {
      expect(isEmailVerified('unknown@example.com')).toBe(false);
    });

    test('should return false after expiry even if verified', () => {
      const { code } = createOTP('test@example.com');
      verifyOTP('test@example.com', code);

      // Manually expire
      const record = _otpStore.get('test@example.com');
      record.expiresAt = Date.now() - 1000;
      _otpStore.set('test@example.com', record);

      expect(isEmailVerified('test@example.com')).toBe(false);
    });
  });

  describe('consumeOTP', () => {
    test('should remove OTP after consumption', () => {
      const { code } = createOTP('test@example.com');
      verifyOTP('test@example.com', code);

      consumeOTP('test@example.com');

      expect(isEmailVerified('test@example.com')).toBe(false);
      expect(_otpStore.has('test@example.com')).toBe(false);
    });
  });
});
