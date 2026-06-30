// tests/otpDemoMode.test.js
// Env-gated demo fallback: when OTP_DEMO_MODE is on AND no real email provider is
// configured, the code is logged server-side and registration proceeds — the code
// is NEVER returned to the client. Otherwise it fails closed (no leak).
const otp = require('../server/services/otpService');

const KEYS = ['OTP_DEMO_MODE', 'RESEND_API_KEY', 'SENDGRID_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'NODE_ENV'];

describe('OTP demo mode', () => {
  let saved;
  beforeEach(() => { saved = {}; KEYS.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; }); });
  afterEach(() => { KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }); });

  test('issues code via server logs, success, and never leaks the code', async () => {
    process.env.OTP_DEMO_MODE = 'true';
    const res = await otp.sendOTPEmail('demo@example.com', '123456');
    expect(res.success).toBe(true);
    expect(res.demo).toBe(true);
    expect(JSON.stringify(res)).not.toContain('123456');
  });

  test('hard override: demo wins even when a key is present (no network)', async () => {
    process.env.OTP_DEMO_MODE = 'true';
    process.env.RESEND_API_KEY = 'should-be-ignored';
    const res = await otp.sendOTPEmail('demo@example.com', '123456');
    expect(res.demo).toBe(true);
    expect(JSON.stringify(res)).not.toContain('123456');
  });

  test('without demo mode + no provider (prod) → fails closed, no leak', async () => {
    process.env.NODE_ENV = 'production';
    const res = await otp.sendOTPEmail('demo@example.com', '123456');
    expect(res.success).toBe(false);
    expect(JSON.stringify(res)).not.toContain('123456');
  });
});
