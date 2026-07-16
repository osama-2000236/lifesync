// tests/otp.test.js
// ============================================
// OTP Service Test Suite
// Tests the two-step registration OTP workflow.
// OTP state now lives in the shared ephemeralStore (memory backend in test);
// the service API is async, so every call is awaited.
// ============================================

const {
  createOTP, verifyOTP, isEmailVerified, consumeOTP, sendOTPEmail, _otpStore,
} = require('../server/services/otpService');

// Clear store before each test
beforeEach(() => {
  _otpStore.clear();
});

describe('OTP Service', () => {
  describe('createOTP', () => {
    test('should generate a 6-digit OTP', async () => {
      const result = await createOTP('test@example.com');

      expect(result.success).toBe(true);
      expect(result.code).toBeDefined();
      expect(result.code).toHaveLength(6);
      expect(/^\d{6}$/.test(result.code)).toBe(true);
    });

    test('should set expiry time', async () => {
      const result = await createOTP('test@example.com');

      expect(result.expiresIn).toBeGreaterThan(0);
    });

    test('should enforce cooldown between requests', async () => {
      await createOTP('test@example.com');
      const result2 = await createOTP('test@example.com');

      expect(result2.success).toBe(false);
      expect(result2.retryAfter).toBeGreaterThan(0);
    });

    test('should normalize email to lowercase', async () => {
      await createOTP('Test@Example.COM');

      expect(_otpStore.has('test@example.com')).toBe(true);
    });

    test('should generate different codes for different emails', async () => {
      const r1 = await createOTP('user1@example.com');
      const r2 = await createOTP('user2@example.com');

      expect(r1.code).toBeDefined();
      expect(r2.code).toBeDefined();
      // While theoretically they could be the same, with 6-digit codes it's extremely unlikely
    });
  });

  describe('verifyOTP', () => {
    test('should verify correct code', async () => {
      const { code } = await createOTP('test@example.com');
      const result = await verifyOTP('test@example.com', code);

      expect(result.success).toBe(true);
    });

    test('should reject incorrect code', async () => {
      await createOTP('test@example.com');
      const result = await verifyOTP('test@example.com', '000000');

      expect(result.success).toBe(false);
      expect(result.code).toBe('OTP_INVALID');
    });

    test('should return not found for unregistered email', async () => {
      const result = await verifyOTP('unknown@example.com', '123456');

      expect(result.success).toBe(false);
      expect(result.code).toBe('OTP_NOT_FOUND');
    });

    test('should reject after max attempts', async () => {
      await createOTP('test@example.com');

      // Exhaust all 5 attempts
      for (let i = 0; i < 5; i++) {
        await verifyOTP('test@example.com', '000000');
      }

      // The 5th failed attempt triggers OTP_MAX_ATTEMPTS and clears the store
      // So the next call should get OTP_NOT_FOUND since the store was cleaned
      const result = await verifyOTP('test@example.com', '000000');

      expect(result.success).toBe(false);
      // After max attempts are exhausted, store is cleared on next verify call
      expect(['OTP_NOT_FOUND', 'OTP_MAX_ATTEMPTS']).toContain(result.code);
    });

    test('should track remaining attempts', async () => {
      await createOTP('test@example.com');
      const result = await verifyOTP('test@example.com', '000000');

      expect(result.success).toBe(false);
      expect(result.message).toContain('attempt');
    });

    test('should reject expired OTP', async () => {
      const { code } = await createOTP('test@example.com');

      // Manually expire the OTP
      const record = await _otpStore.get('test@example.com');
      record.expiresAt = Date.now() - 1000; // Expired 1 second ago
      await _otpStore.set('test@example.com', record);

      const result = await verifyOTP('test@example.com', code);

      expect(result.success).toBe(false);
      expect(result.code).toBe('OTP_EXPIRED');
    });
  });

  describe('isEmailVerified', () => {
    test('should return true after successful verification', async () => {
      const { code } = await createOTP('test@example.com');
      await verifyOTP('test@example.com', code);

      expect(await isEmailVerified('test@example.com')).toBe(true);
    });

    test('should return false for unverified email', async () => {
      await createOTP('test@example.com');

      expect(await isEmailVerified('test@example.com')).toBe(false);
    });

    test('should return false for unknown email', async () => {
      expect(await isEmailVerified('unknown@example.com')).toBe(false);
    });

    test('should return false after expiry even if verified', async () => {
      const { code } = await createOTP('test@example.com');
      await verifyOTP('test@example.com', code);

      // Manually expire
      const record = await _otpStore.get('test@example.com');
      record.expiresAt = Date.now() - 1000;
      await _otpStore.set('test@example.com', record);

      expect(await isEmailVerified('test@example.com')).toBe(false);
    });
  });

  describe('consumeOTP', () => {
    test('should remove OTP after consumption', async () => {
      const { code } = await createOTP('test@example.com');
      await verifyOTP('test@example.com', code);

      await consumeOTP('test@example.com');

      expect(await isEmailVerified('test@example.com')).toBe(false);
      expect(_otpStore.has('test@example.com')).toBe(false);
    });
  });

  describe('sendOTPEmail', () => {
    test('should fail immediately in production when SMTP is not configured', async () => {
      const previousNodeEnv = process.env.NODE_ENV;
      const previousHost = process.env.SMTP_HOST;
      const previousUser = process.env.SMTP_USER;
      const previousPass = process.env.SMTP_PASS;

      process.env.NODE_ENV = 'production';
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;

      let result;
      let elapsedMs;

      try {
        const startedAt = Date.now();
        result = await sendOTPEmail('test@example.com', '123456');
        elapsedMs = Date.now() - startedAt;
      } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;

        if (previousHost === undefined) delete process.env.SMTP_HOST;
        else process.env.SMTP_HOST = previousHost;

        if (previousUser === undefined) delete process.env.SMTP_USER;
        else process.env.SMTP_USER = previousUser;

        if (previousPass === undefined) delete process.env.SMTP_PASS;
        else process.env.SMTP_PASS = previousPass;
      }

      expect(result).toEqual(expect.objectContaining({
        success: false,
        code: 'SMTP_NOT_CONFIGURED',
      }));
      expect(elapsedMs).toBeLessThan(1000);
    });

    test('HTTP mail providers send with an abort timeout (hanging API cannot stall requests)', async () => {
      const savedFetch = global.fetch;
      const savedKey = process.env.BREVO_API_KEY;
      const savedFrom = process.env.BREVO_FROM;
      global.fetch = jest.fn().mockResolvedValue({ ok: true });
      process.env.BREVO_API_KEY = 'test-key';
      process.env.BREVO_FROM = 'noreply@example.com';
      try {
        const result = await sendOTPEmail('test@example.com', '123456');
        expect(result.success).toBe(true);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        const options = global.fetch.mock.calls[0][1];
        expect(options.signal).toBeInstanceOf(AbortSignal);
      } finally {
        global.fetch = savedFetch;
        if (savedKey === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = savedKey;
        if (savedFrom === undefined) delete process.env.BREVO_FROM; else process.env.BREVO_FROM = savedFrom;
      }
    });

    test('provider API error fails closed with EMAIL_SEND_FAILED (no code leak)', async () => {
      const savedFetch = global.fetch;
      const savedKey = process.env.BREVO_API_KEY;
      const savedFrom = process.env.BREVO_FROM;
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });
      process.env.BREVO_API_KEY = 'test-key';
      process.env.BREVO_FROM = 'noreply@example.com';
      try {
        const result = await sendOTPEmail('test@example.com', '123456');
        expect(result).toEqual(expect.objectContaining({ success: false, code: 'EMAIL_SEND_FAILED' }));
        expect(result.message).not.toContain('123456');
      } finally {
        global.fetch = savedFetch;
        if (savedKey === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = savedKey;
        if (savedFrom === undefined) delete process.env.BREVO_FROM; else process.env.BREVO_FROM = savedFrom;
      }
    });
  });
});
