// server/services/otpService.js
// ============================================
// OTP Service — One-Time Password for Email Verification
// Implements the two-step registration workflow (SR1.2):
//   Step 1: User provides email → OTP sent
//   Step 2: User verifies OTP → sets username + password
// ============================================

const crypto = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config();

// ============================================
// In-memory OTP store (production: use Redis)
// Structure: { email: { code, expiresAt, attempts, verified } }
// ============================================
const otpStore = new Map();

// Configuration
const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const COOLDOWN_SECONDS = 60; // Minimum seconds between OTP sends
const SMTP_TIMEOUT_MS = parseInt(process.env.SMTP_TIMEOUT_MS || '10000', 10);

const hasConfiguredSmtp = () => (
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
);

/**
 * Generate a cryptographically random numeric OTP
 * @returns {string} 6-digit OTP code
 */
const generateOTP = () => {
  const buffer = crypto.randomBytes(4);
  const num = buffer.readUInt32BE(0) % Math.pow(10, OTP_LENGTH);
  return String(num).padStart(OTP_LENGTH, '0');
};

/**
 * Create and store an OTP for an email address
 * @param {string} email - The email to send OTP to
 * @returns {{ success: boolean, message: string, expiresIn?: number }}
 */
const createOTP = (email) => {
  const normalizedEmail = email.toLowerCase().trim();

  // Check cooldown
  const existing = otpStore.get(normalizedEmail);
  if (existing) {
    const secondsSinceCreated = (Date.now() - (existing.createdAt || 0)) / 1000;
    if (secondsSinceCreated < COOLDOWN_SECONDS) {
      const waitSeconds = Math.ceil(COOLDOWN_SECONDS - secondsSinceCreated);
      return {
        success: false,
        message: `Please wait ${waitSeconds} seconds before requesting a new code.`,
        retryAfter: waitSeconds,
      };
    }
  }

  const code = generateOTP();
  const now = Date.now();

  otpStore.set(normalizedEmail, {
    code,
    createdAt: now,
    expiresAt: now + OTP_EXPIRY_MINUTES * 60 * 1000,
    attempts: 0,
    verified: false,
  });

  return {
    success: true,
    code, // Returned so the controller can send it via email
    expiresIn: OTP_EXPIRY_MINUTES * 60,
    message: `Verification code sent. Valid for ${OTP_EXPIRY_MINUTES} minutes.`,
  };
};

/**
 * Verify an OTP code for an email
 * @param {string} email
 * @param {string} code - The OTP to verify
 * @returns {{ success: boolean, message: string }}
 */
const verifyOTP = (email, code) => {
  const normalizedEmail = email.toLowerCase().trim();
  const record = otpStore.get(normalizedEmail);

  if (!record) {
    return {
      success: false,
      message: 'No verification code found. Please request a new one.',
      code: 'OTP_NOT_FOUND',
    };
  }

  // Check expiry
  if (Date.now() > record.expiresAt) {
    otpStore.delete(normalizedEmail);
    return {
      success: false,
      message: 'Verification code has expired. Please request a new one.',
      code: 'OTP_EXPIRED',
    };
  }

  // Check max attempts
  if (record.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(normalizedEmail);
    return {
      success: false,
      message: 'Too many failed attempts. Please request a new code.',
      code: 'OTP_MAX_ATTEMPTS',
    };
  }

  // Verify code
  record.attempts += 1;

  if (record.code !== code) {
    const remaining = MAX_ATTEMPTS - record.attempts;
    return {
      success: false,
      message: `Invalid code. ${remaining} attempt(s) remaining.`,
      code: 'OTP_INVALID',
    };
  }

  // Mark as verified (don't delete yet — needed for step 2)
  record.verified = true;
  otpStore.set(normalizedEmail, record);

  return {
    success: true,
    message: 'Email verified successfully. You may now complete registration.',
  };
};

/**
 * Check if an email has been OTP-verified (for step 2 of registration)
 * @param {string} email
 * @returns {boolean}
 */
const isEmailVerified = (email) => {
  const normalizedEmail = email.toLowerCase().trim();
  const record = otpStore.get(normalizedEmail);

  if (!record) return false;
  if (Date.now() > record.expiresAt) {
    otpStore.delete(normalizedEmail);
    return false;
  }

  return record.verified === true;
};

/**
 * Consume (remove) a verified OTP after registration completes
 * @param {string} email
 */
const consumeOTP = (email) => {
  otpStore.delete(email.toLowerCase().trim());
};

// ============================================
// Email Transport (Nodemailer)
// ============================================

/**
 * Create the email transporter
 * Uses environment config; falls back to Ethereal for development
 */
const createTransporter = async () => {
  // Production: use real SMTP
  if (hasConfiguredSmtp() && process.env.SMTP_HOST !== 'smtp.ethereal.email') {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
      dnsTimeout: SMTP_TIMEOUT_MS,
    });
  }

  if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
    throw new Error('SMTP is not configured.');
  }

  // Development: use Ethereal (fake SMTP for testing)
  // Emails are captured and viewable at https://ethereal.email
  try {
    const testAccount = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
      dnsTimeout: SMTP_TIMEOUT_MS,
    });
    console.log('📧 Using Ethereal test email account:', testAccount.user);
    return transporter;
  } catch (err) {
    console.warn('⚠️  Could not create Ethereal account. OTP will be logged to console only.');
    return null;
  }
};

/**
 * Send the OTP verification email
 * @param {string} email - Recipient email address
 * @param {string} code - The OTP code
 * @returns {{ success: boolean, previewUrl?: string }}
 */
const sendOTPEmail = async (email, code) => {
  // Always log OTP in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`\n📧 LifeSync OTP for ${email}: ${code}\n`);
  }

  try {
    const transporter = await createTransporter();
    if (!transporter) {
      return { success: true, message: 'OTP logged to console (no email transport).' };
    }

    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LifeSync'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'noreply@lifesync.app'}>`,
      to: email,
      subject: 'LifeSync — Your Verification Code',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #1e293b; font-size: 24px; margin: 0;">LifeSync</h1>
            <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Smart Life Management</p>
          </div>
          <div style="background: white; border-radius: 8px; padding: 24px; text-align: center; border: 1px solid #e2e8f0;">
            <p style="color: #475569; font-size: 16px; margin-bottom: 20px;">
              Your verification code is:
            </p>
            <div style="background: #f1f5f9; border-radius: 8px; padding: 16px; display: inline-block; margin-bottom: 20px;">
              <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #0f172a; font-family: monospace;">
                ${code}
              </span>
            </div>
            <p style="color: #94a3b8; font-size: 13px;">
              This code expires in ${OTP_EXPIRY_MINUTES} minutes.<br>
              If you didn't request this, you can safely ignore it.
            </p>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    const previewUrl = nodemailer.getTestMessageUrl(info);

    if (previewUrl) {
      console.log(`📧 Preview email at: ${previewUrl}`);
    }

    return {
      success: true,
      previewUrl: previewUrl || null,
      message: 'Verification email sent.',
    };
  } catch (error) {
    console.error('Email send error:', error.message);
    if (error.message === 'SMTP is not configured.') {
      return {
        success: false,
        code: 'SMTP_NOT_CONFIGURED',
        message: 'Email delivery is not configured right now. Please contact support.',
      };
    }

    return {
      success: false,
      code: 'EMAIL_SEND_FAILED',
      message: 'Failed to send email. Please try again.',
    };
  }
};

module.exports = {
  createOTP,
  verifyOTP,
  isEmailVerified,
  consumeOTP,
  sendOTPEmail,
  // Exported for testing
  _otpStore: otpStore,
};
