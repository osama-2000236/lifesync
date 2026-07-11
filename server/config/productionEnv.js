// server/config/productionEnv.js
// ============================================
// Production boot guard — fail closed BEFORE listening.
// Weak/missing secrets, demo OTP mode, or no way to deliver OTP email are
// configuration bugs; crashing at boot with a precise message beats limping
// into runtime and failing on the first registration or first encrypted read.
//
// Deliberately NOT enforced here:
//   • OpenRouter/Gemini keys — BERT-only deploys are valid.
//   • Redis — single-instance deploys (Railway) are valid; warn only.
// ============================================

// Includes this repo's docker-compose defaults — public in git history.
const PLACEHOLDER_RE = /^(change_this|your_jwt_secret|your_secret|changeme|placeholder|example|lifesync_encryption_key)/i;

const isTruthy = (v) => ['1', 'true', 'yes', 'on'].includes(String(v || '').toLowerCase());

// Pure: returns an array of problem strings (empty = env OK). Testable without
// booting the server or mutating process.env inside.
const collectProductionEnvErrors = (env = process.env) => {
  const errors = [];

  const jwt = (env.JWT_SECRET || '').trim();
  const refresh = (env.JWT_REFRESH_SECRET || '').trim();
  const enc = (env.ENCRYPTION_KEY || '').trim();

  const checkSecret = (name, value) => {
    if (!value) errors.push(`${name} is not set.`);
    else if (value.length < 32) errors.push(`${name} must be at least 32 characters (got ${value.length}).`);
    else if (PLACEHOLDER_RE.test(value)) errors.push(`${name} looks like a placeholder value — set a real secret.`);
  };

  checkSecret('JWT_SECRET', jwt);
  checkSecret('JWT_REFRESH_SECRET', refresh);
  checkSecret('ENCRYPTION_KEY', enc);

  if (jwt && refresh && jwt === refresh) {
    errors.push('JWT_REFRESH_SECRET must differ from JWT_SECRET.');
  }
  if (enc && (enc === jwt || enc === refresh)) {
    errors.push('ENCRYPTION_KEY must differ from the JWT secrets (independent rotation).');
  }

  if (isTruthy(env.OTP_DEMO_MODE)) {
    errors.push('OTP_DEMO_MODE must not be enabled in production — codes would be logged instead of delivered.');
  }

  // OTP delivery: at least one real provider (mirrors otpService.sendOTPEmail).
  // Prefer HTTP providers (Brevo/SendGrid/Resend) on hosts that block SMTP.
  const hasBrevo = Boolean(env.BREVO_API_KEY);
  const hasSendgrid = Boolean(env.SENDGRID_API_KEY);
  const hasResend = Boolean(env.RESEND_API_KEY);
  const hasSmtp = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
  const hasMail = hasBrevo || hasSendgrid || hasResend || hasSmtp;
  if (!hasMail) {
    errors.push(
      'No OTP email provider configured. Set one of: BREVO_API_KEY, '
      + 'SENDGRID_API_KEY, RESEND_API_KEY, or SMTP_HOST+SMTP_USER+SMTP_PASS.',
    );
  }
  // Brevo/SendGrid require a verified sender — same checks as otpService at send time.
  if (hasBrevo && !(env.BREVO_FROM || env.SMTP_FROM_EMAIL)) {
    errors.push('BREVO_API_KEY is set but BREVO_FROM (or SMTP_FROM_EMAIL) is missing.');
  }
  if (hasSendgrid && !(env.SENDGRID_FROM || env.SMTP_FROM_EMAIL)) {
    errors.push('SENDGRID_API_KEY is set but SENDGRID_FROM (or SMTP_FROM_EMAIL) is missing.');
  }

  return errors;
};

// Warnings that should not block boot (single-instance deploys are valid).
const collectProductionEnvWarnings = (env = process.env) => {
  const warnings = [];
  if (!env.REDIS_URL && !env.REDIS_HOST) {
    warnings.push(
      'REDIS_URL is not set — OTP/clarification/interview/OAuth-state and rate-limit '
      + 'counters are in-process only. Fine for a single instance; restarts drop pending '
      + 'OTPs and multi-instance deploys will not share state. Set REDIS_URL to make it '
      + 'durable/shared.',
    );
  }
  return warnings;
};

/** Throws with every problem listed when NODE_ENV=production; no-op otherwise. */
const assertProductionEnv = (env = process.env) => {
  if (env.NODE_ENV !== 'production') return;

  for (const w of collectProductionEnvWarnings(env)) console.warn(`⚠️  [boot] ${w}`);

  const errors = collectProductionEnvErrors(env);
  if (errors.length) {
    throw new Error(
      `Production environment check failed:\n  - ${errors.join('\n  - ')}`,
    );
  }
  console.log('✅ Production environment checks passed.');
};

module.exports = {
  assertProductionEnv,
  collectProductionEnvErrors,
  collectProductionEnvWarnings,
};
