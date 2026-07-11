// tests/productionEnv.test.js
// ============================================
// Production boot guard — fail closed on weak/missing secrets, demo OTP mode,
// or no OTP mail provider. Pure helpers take an env object, so no process.env
// mutation and no server boot needed.
// ============================================

const {
  assertProductionEnv,
  collectProductionEnvErrors,
  collectProductionEnvWarnings,
} = require('../server/config/productionEnv');

const STRONG = 'a'.repeat(32);
const goodEnv = () => ({
  NODE_ENV: 'production',
  JWT_SECRET: `jwt-${STRONG}`,
  JWT_REFRESH_SECRET: `refresh-${STRONG}`,
  ENCRYPTION_KEY: `enc-${STRONG}`,
  RESEND_API_KEY: 're_test',
  REDIS_URL: 'redis://localhost:6379',
});

describe('assertProductionEnv', () => {
  test('strong secrets + mail provider → does not throw', () => {
    expect(() => assertProductionEnv(goodEnv())).not.toThrow();
  });

  test('non-production ignores weak/missing everything', () => {
    expect(() => assertProductionEnv({ NODE_ENV: 'test' })).not.toThrow();
    expect(() => assertProductionEnv({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertProductionEnv({})).not.toThrow();
  });

  test('missing JWT_SECRET → throws naming it', () => {
    const env = goodEnv();
    delete env.JWT_SECRET;
    expect(() => assertProductionEnv(env)).toThrow(/JWT_SECRET is not set/);
  });

  test('short JWT_SECRET (< 32) → throws', () => {
    const env = { ...goodEnv(), JWT_SECRET: 'short-but-over-sixteen!' };
    expect(() => assertProductionEnv(env)).toThrow(/at least 32/);
  });

  test('placeholder secret → throws', () => {
    const env = { ...goodEnv(), JWT_SECRET: 'change_this_in_production_at_least_32_chars' };
    expect(() => assertProductionEnv(env)).toThrow(/placeholder/);
  });

  test('refresh secret equal to JWT_SECRET → throws', () => {
    const env = goodEnv();
    env.JWT_REFRESH_SECRET = env.JWT_SECRET;
    expect(() => assertProductionEnv(env)).toThrow(/must differ from JWT_SECRET/);
  });

  test('ENCRYPTION_KEY equal to a JWT secret → throws', () => {
    const env = goodEnv();
    env.ENCRYPTION_KEY = env.JWT_SECRET;
    expect(() => assertProductionEnv(env)).toThrow(/ENCRYPTION_KEY must differ/);
  });

  test('OTP_DEMO_MODE truthy → throws (every spelling)', () => {
    for (const v of ['1', 'true', 'yes', 'on', 'TRUE']) {
      expect(() => assertProductionEnv({ ...goodEnv(), OTP_DEMO_MODE: v }))
        .toThrow(/OTP_DEMO_MODE/);
    }
    expect(() => assertProductionEnv({ ...goodEnv(), OTP_DEMO_MODE: 'false' })).not.toThrow();
  });

  test('no mail provider → throws listing the options', () => {
    const env = goodEnv();
    delete env.RESEND_API_KEY;
    expect(() => assertProductionEnv(env)).toThrow(/BREVO_API_KEY.*SENDGRID_API_KEY.*RESEND_API_KEY.*SMTP_HOST/s);
  });

  test('each provider alone satisfies the mail check', () => {
    const base = goodEnv();
    delete base.RESEND_API_KEY;
    expect(collectProductionEnvErrors({
      ...base, BREVO_API_KEY: 'k', BREVO_FROM: 'noreply@example.com',
    })).toEqual([]);
    expect(collectProductionEnvErrors({
      ...base, SENDGRID_API_KEY: 'k', SENDGRID_FROM: 'noreply@example.com',
    })).toEqual([]);
    expect(collectProductionEnvErrors({ ...base, RESEND_API_KEY: 'k' })).toEqual([]);
    expect(collectProductionEnvErrors({
      ...base, SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p',
    })).toEqual([]);
    // Partial SMTP does NOT count.
    expect(collectProductionEnvErrors({ ...base, SMTP_HOST: 'h' })).not.toEqual([]);
  });

  test('Brevo/SendGrid without verified FROM fail closed', () => {
    const base = goodEnv();
    delete base.RESEND_API_KEY;
    expect(collectProductionEnvErrors({ ...base, BREVO_API_KEY: 'k' }).join(' '))
      .toMatch(/BREVO_FROM/);
    expect(collectProductionEnvErrors({ ...base, SENDGRID_API_KEY: 'k' }).join(' '))
      .toMatch(/SENDGRID_FROM/);
    // SMTP_FROM_EMAIL is an acceptable alias for both.
    expect(collectProductionEnvErrors({
      ...base, BREVO_API_KEY: 'k', SMTP_FROM_EMAIL: 'a@b.com',
    })).toEqual([]);
  });

  test('all problems reported at once (not just the first)', () => {
    const errors = collectProductionEnvErrors({ NODE_ENV: 'production' });
    expect(errors.length).toBeGreaterThanOrEqual(4); // 3 secrets + mail
  });
});

describe('collectProductionEnvWarnings', () => {
  test('missing Redis warns but never blocks', () => {
    const env = goodEnv();
    delete env.REDIS_URL;
    expect(collectProductionEnvWarnings(env)).toHaveLength(1);
    expect(collectProductionEnvWarnings(env)[0]).toMatch(/REDIS_URL/);
    expect(() => assertProductionEnv(env)).not.toThrow();
  });

  test('REDIS_HOST also satisfies the Redis check', () => {
    const env = goodEnv();
    delete env.REDIS_URL;
    env.REDIS_HOST = '127.0.0.1';
    expect(collectProductionEnvWarnings(env)).toHaveLength(0);
  });
});
