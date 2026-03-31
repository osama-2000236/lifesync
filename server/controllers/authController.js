// server/controllers/authController.js
// ============================================
// Authentication Controller v2
// Implements Two-Step Registration (SR1.2):
//   Step 1: POST /register/send-otp   → email → OTP sent
//   Step 2: POST /register/complete    → OTP + username + password → account created
// Also: Login, Token Refresh, Profile
// ============================================

const { body } = require('express-validator');
const { Op } = require('sequelize');
const User = require('../models/User');
const { generateTokenPair, verifyRefreshToken } = require('../utils/tokenUtils');
const { success, created, error } = require('../utils/responseHelper');
const { verifyGoogleCredential } = require('../services/googleAuthService');
const { generateUniqueUsername } = require('../utils/usernameUtils');
const {
  createOTP, verifyOTP, isEmailVerified, consumeOTP, sendOTPEmail,
} = require('../services/otpService');

// ============================================
// VALIDATION RULES
// ============================================

const sendOtpValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address.'),
];

const verifyOtpValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address.'),
  body('code')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('Verification code must be a 6-digit number.'),
];

const completeRegistrationValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address.'),
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be 3-50 characters.')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores.'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters.')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase, one lowercase, and one number.'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be 1-100 characters.'),
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address.'),
  body('password')
    .notEmpty()
    .withMessage('Password is required.'),
];

const googleLoginValidation = [
  body('credential')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Google credential is required.'),
];

// ============================================
// STEP 1: SEND OTP
// ============================================

/**
 * POST /api/auth/register/send-otp
 * Step 1 of registration: Send a verification code to the email
 */
const sendRegistrationOTP = async (req, res, next) => {
  try {
    const { email } = req.body;

    // Check if email is already registered
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return error(res, 'An account with this email already exists.', 409, 'DUPLICATE_EMAIL');
    }

    // Generate OTP
    const otpResult = createOTP(email);
    if (!otpResult.success) {
      return error(res, otpResult.message, 429, 'OTP_COOLDOWN');
    }

    // Send OTP via email
    const emailResult = await sendOTPEmail(email, otpResult.code);

    return success(res, {
      email,
      expiresIn: otpResult.expiresIn,
      // Include preview URL in development for testing
      ...(process.env.NODE_ENV === 'development' && emailResult.previewUrl
        ? { previewUrl: emailResult.previewUrl }
        : {}),
    }, 'Verification code sent to your email.');
  } catch (err) {
    next(err);
  }
};

// ============================================
// STEP 1.5: VERIFY OTP
// ============================================

/**
 * POST /api/auth/register/verify-otp
 * Verify the OTP code (intermediate step before setting credentials)
 */
const verifyRegistrationOTP = async (req, res, next) => {
  try {
    const { email, code } = req.body;

    const result = verifyOTP(email, code);

    if (!result.success) {
      const statusCode = result.code === 'OTP_MAX_ATTEMPTS' ? 429 : 400;
      return error(res, result.message, statusCode, result.code);
    }

    return success(res, {
      email,
      verified: true,
    }, 'Email verified! Please set your username and password to complete registration.');
  } catch (err) {
    next(err);
  }
};

// ============================================
// STEP 2: COMPLETE REGISTRATION
// ============================================

/**
 * POST /api/auth/register/complete
 * Step 2: After OTP verification, set username and password
 */
const completeRegistration = async (req, res, next) => {
  try {
    const { email, username, password, name } = req.body;

    // Verify that the email was OTP-verified
    if (!isEmailVerified(email)) {
      return error(
        res,
        'Email has not been verified. Please complete Step 1 (OTP verification) first.',
        403,
        'EMAIL_NOT_VERIFIED'
      );
    }

    // Check for duplicate username
    const existingUsername = await User.findOne({ where: { username } });
    if (existingUsername) {
      return error(res, 'This username is already taken.', 409, 'DUPLICATE_USERNAME');
    }

    // Double-check email isn't taken (race condition guard)
    const existingEmail = await User.findOne({ where: { email } });
    if (existingEmail) {
      consumeOTP(email);
      return error(res, 'An account with this email already exists.', 409, 'DUPLICATE_EMAIL');
    }

    // Create the user (password hashed via beforeCreate hook)
    const user = await User.create({
      username,
      email,
      hashed_password: password,
      name: name || null,
      role: 'user',
      verified_email: true, // Email was verified via OTP
      is_active: true,
    });

    // Consume the OTP (one-time use complete)
    consumeOTP(email);

    // Generate tokens
    const tokens = generateTokenPair(user);

    return created(res, {
      user: user.toSafeJSON(),
      ...tokens,
    }, 'Registration complete! Welcome to LifeSync.');
  } catch (err) {
    next(err);
  }
};

// ============================================
// LOGIN
// ============================================

/**
 * POST /api/auth/login
 * Authenticate user and return JWT tokens
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return error(res, 'Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    if (!user.is_active) {
      return error(res, 'This account has been deactivated.', 403, 'ACCOUNT_DEACTIVATED');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return error(res, 'Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    // Update last login timestamp
    await user.update({ last_login_at: new Date() });

    const tokens = generateTokenPair(user);

    return success(res, {
      user: user.toSafeJSON(),
      ...tokens,
    }, 'Login successful.');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/google
 * Authenticate or register a user using a Google ID token.
 */
const loginWithGoogle = async (req, res, next) => {
  try {
    const { credential } = req.body;
    const googleProfile = await verifyGoogleCredential(credential);
    const googleIdentity = `google:${googleProfile.subject}`;

    let user = await User.findOne({
      where: {
        [Op.or]: [
          { firebase_uid: googleIdentity },
          { email: googleProfile.email },
        ],
      },
    });

    if (!user) {
      const username = await generateUniqueUsername(User, googleProfile);
      user = await User.create({
        username,
        email: googleProfile.email,
        name: googleProfile.name,
        avatar_url: googleProfile.avatarUrl,
        role: 'user',
        verified_email: true,
        firebase_uid: googleIdentity,
        is_active: true,
      });
    } else {
      if (!user.is_active) {
        return error(res, 'This account has been deactivated.', 403, 'ACCOUNT_DEACTIVATED');
      }

      if (user.firebase_uid && user.firebase_uid !== googleIdentity) {
        return error(
          res,
          'This email is already linked to a different social sign-in provider.',
          409,
          'SOCIAL_ACCOUNT_CONFLICT'
        );
      }

      await user.update({
        firebase_uid: user.firebase_uid || googleIdentity,
        verified_email: true,
        name: user.name || googleProfile.name,
        avatar_url: user.avatar_url || googleProfile.avatarUrl,
      });
    }

    await user.update({ last_login_at: new Date() });

    const tokens = generateTokenPair(user);

    return success(res, {
      user: user.toSafeJSON(),
      ...tokens,
    }, 'Google login successful.');
  } catch (err) {
    if (
      err.message === 'Google authentication is not configured.'
      || err.message === 'Google account email is not verified.'
      || err.message === 'Google did not return a valid identity.'
    ) {
      return error(res, err.message, 400, 'GOOGLE_AUTH_FAILED');
    }

    if (err.message?.includes('Wrong recipient')) {
      return error(res, 'This Google credential was issued for a different app.', 401, 'GOOGLE_AUTH_FAILED');
    }

    next(err);
  }
};

// ============================================
// TOKEN REFRESH
// ============================================

/**
 * POST /api/auth/refresh
 * Generate new token pair using refresh token
 */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return error(res, 'Refresh token is required.', 400);
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch (err) {
      return error(res, 'Invalid or expired refresh token.', 401, 'INVALID_REFRESH_TOKEN');
    }

    const user = await User.findByPk(decoded.id);
    if (!user || !user.is_active) {
      return error(res, 'User not found or account deactivated.', 401);
    }

    const tokens = generateTokenPair(user);

    return success(res, tokens, 'Tokens refreshed successfully.');
  } catch (err) {
    next(err);
  }
};

// ============================================
// PROFILE
// ============================================

/**
 * GET /api/auth/me
 */
const getProfile = async (req, res) => {
  return success(res, { user: req.user.toSafeJSON() }, 'Profile retrieved.');
};

/**
 * PUT /api/auth/me
 */
const updateProfile = async (req, res, next) => {
  try {
    const { name, avatar_url } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;

    await req.user.update(updates);
    return success(res, { user: req.user.toSafeJSON() }, 'Profile updated.');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  // Step 1: Send OTP
  sendRegistrationOTP,
  sendOtpValidation,
  // Step 1.5: Verify OTP
  verifyRegistrationOTP,
  verifyOtpValidation,
  // Step 2: Complete registration
  completeRegistration,
  completeRegistrationValidation,
  // Login
  login,
  loginValidation,
  loginWithGoogle,
  googleLoginValidation,
  // Token refresh
  refreshToken,
  // Profile
  getProfile,
  updateProfile,
};
