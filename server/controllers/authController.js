// server/controllers/authController.js
// ============================================
// Authentication Controller v2
// Implements OTP registration, password recovery,
// account management, Google sign-in, and profile flows.
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

const forgotPasswordValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email required.'),
];

const resetPasswordValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email required.'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters.')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and a number.'),
];

const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required.'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters.')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain uppercase, lowercase, and a number.'),
];

const changeEmailSendValidation = [
  body('newEmail')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid new email address.'),
];

const changeEmailVerifyValidation = [
  body('newEmail')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid new email address.'),
  body('code')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('Verification code must be a 6-digit number.'),
];

const isGoogleManagedAccount = (user) => Boolean(user?.firebase_uid);

// ============================================
// STEP 1: SEND OTP
// ============================================

const sendRegistrationOTP = async (req, res, next) => {
  try {
    const { email } = req.body;

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return error(res, 'An account with this email already exists.', 409, 'DUPLICATE_EMAIL');
    }

    const otpResult = createOTP(email);
    if (!otpResult.success) {
      return error(res, otpResult.message, 429, 'OTP_COOLDOWN');
    }

    const emailResult = await sendOTPEmail(email, otpResult.code);

    return success(res, {
      email,
      expiresIn: otpResult.expiresIn,
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

const completeRegistration = async (req, res, next) => {
  try {
    const { email, username, password, name } = req.body;

    if (!isEmailVerified(email)) {
      return error(
        res,
        'Email has not been verified. Please complete Step 1 (OTP verification) first.',
        403,
        'EMAIL_NOT_VERIFIED'
      );
    }

    const existingUsername = await User.findOne({ where: { username } });
    if (existingUsername) {
      return error(res, 'This username is already taken.', 409, 'DUPLICATE_USERNAME');
    }

    const existingEmail = await User.findOne({ where: { email } });
    if (existingEmail) {
      consumeOTP(email);
      return error(res, 'An account with this email already exists.', 409, 'DUPLICATE_EMAIL');
    }

    const user = await User.create({
      username,
      email,
      hashed_password: password,
      name: name || null,
      role: 'user',
      verified_email: true,
      is_active: true,
    });

    consumeOTP(email);

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
      || err.message === 'Unable to verify Google sign-in right now.'
    ) {
      return error(res, err.message, 503, 'GOOGLE_AUTH_UNAVAILABLE');
    }

    if (
      err.message === 'Google account email is not verified.'
      || err.message === 'Google did not return a valid identity.'
      || err.message === 'Invalid Google credential.'
      || err.message === 'This Google credential was issued for a different app.'
    ) {
      return error(res, err.message, 401, 'GOOGLE_AUTH_FAILED');
    }

    next(err);
  }
};

// ============================================
// TOKEN REFRESH
// ============================================

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

const getProfile = async (req, res) => {
  return success(res, { user: req.user.toSafeJSON() }, 'Profile retrieved.');
};

const updateProfile = async (req, res, next) => {
  try {
    const { name, avatar_url } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name || null;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url || null;

    await req.user.update(updates);
    return success(res, { user: req.user.toSafeJSON() }, 'Profile updated.');
  } catch (err) {
    next(err);
  }
};

// ============================================
// FORGOT PASSWORD
// ============================================

const forgotPasswordSendOTP = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return success(res, { email }, 'If this email is registered, a reset code has been sent.');
    }

    if (isGoogleManagedAccount(user) || !user.hashed_password) {
      return error(
        res,
        'This account uses Google Sign-In and does not have a password to reset.',
        400,
        'GOOGLE_ACCOUNT'
      );
    }

    const otpResult = createOTP(email);
    if (!otpResult.success) {
      return error(res, otpResult.message, 429, 'OTP_COOLDOWN');
    }

    await sendOTPEmail(email, otpResult.code);

    return success(res, { email, expiresIn: otpResult.expiresIn }, 'Password reset code sent to your email.');
  } catch (err) {
    next(err);
  }
};

const forgotPasswordVerifyOTP = async (req, res, next) => {
  try {
    const { email, code } = req.body;

    const result = verifyOTP(email, code);
    if (!result.success) {
      const statusCode = result.code === 'OTP_MAX_ATTEMPTS' ? 429 : 400;
      return error(res, result.message, statusCode, result.code);
    }

    return success(res, { email, verified: true }, 'Code verified. You may now reset your password.');
  } catch (err) {
    next(err);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!isEmailVerified(email)) {
      return error(res, 'Email not verified. Please complete the OTP step first.', 403, 'EMAIL_NOT_VERIFIED');
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return error(res, 'User not found.', 404);
    }

    if (isGoogleManagedAccount(user) || !user.hashed_password) {
      consumeOTP(email);
      return error(
        res,
        'This account uses Google Sign-In and does not have a password to reset.',
        400,
        'GOOGLE_ACCOUNT'
      );
    }

    await user.update({ hashed_password: password });
    consumeOTP(email);

    return success(res, null, 'Password reset successfully. You can now sign in.');
  } catch (err) {
    next(err);
  }
};

// ============================================
// CHANGE PASSWORD (authenticated)
// ============================================

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (isGoogleManagedAccount(req.user) || !req.user.hashed_password) {
      return error(res, 'This account uses Google Sign-In and has no password to change.', 400, 'GOOGLE_ACCOUNT');
    }

    const isMatch = await req.user.comparePassword(currentPassword);
    if (!isMatch) {
      return error(res, 'Current password is incorrect.', 401, 'WRONG_PASSWORD');
    }

    await req.user.update({ hashed_password: newPassword });
    return success(res, null, 'Password changed successfully.');
  } catch (err) {
    next(err);
  }
};

// ============================================
// CHANGE EMAIL (authenticated)
// ============================================

const changeEmailSendOTP = async (req, res, next) => {
  try {
    const { newEmail } = req.body;

    if (isGoogleManagedAccount(req.user)) {
      return error(res, 'This account uses Google Sign-In and cannot change email here.', 400, 'GOOGLE_ACCOUNT');
    }

    if (req.user.email === newEmail) {
      return error(res, 'New email must be different from your current email.', 400, 'EMAIL_UNCHANGED');
    }

    const existingUser = await User.findOne({ where: { email: newEmail } });
    if (existingUser) {
      return error(res, 'An account with this email already exists.', 409, 'DUPLICATE_EMAIL');
    }

    const otpResult = createOTP(newEmail);
    if (!otpResult.success) {
      return error(res, otpResult.message, 429, 'OTP_COOLDOWN');
    }

    const emailResult = await sendOTPEmail(newEmail, otpResult.code);

    return success(res, {
      newEmail,
      expiresIn: otpResult.expiresIn,
      ...(process.env.NODE_ENV === 'development' && emailResult.previewUrl
        ? { previewUrl: emailResult.previewUrl }
        : {}),
    }, 'Verification code sent to your new email address.');
  } catch (err) {
    next(err);
  }
};

const changeEmailVerifyOTP = async (req, res, next) => {
  try {
    const { newEmail, code } = req.body;

    if (isGoogleManagedAccount(req.user)) {
      return error(res, 'This account uses Google Sign-In and cannot change email here.', 400, 'GOOGLE_ACCOUNT');
    }

    const result = verifyOTP(newEmail, code);
    if (!result.success) {
      const statusCode = result.code === 'OTP_MAX_ATTEMPTS' ? 429 : 400;
      return error(res, result.message, statusCode, result.code);
    }

    const existingUser = await User.findOne({ where: { email: newEmail } });
    if (existingUser && existingUser.id !== req.user.id) {
      consumeOTP(newEmail);
      return error(res, 'An account with this email already exists.', 409, 'DUPLICATE_EMAIL');
    }

    await req.user.update({
      email: newEmail,
      verified_email: true,
    });
    consumeOTP(newEmail);

    return success(res, { user: req.user.toSafeJSON() }, 'Email updated successfully.');
  } catch (err) {
    next(err);
  }
};

// ============================================
// DELETE ACCOUNT (authenticated)
// ============================================

const deleteAccount = async (req, res, next) => {
  try {
    await req.user.update({ is_active: false });
    return success(res, null, 'Account deleted. We\'re sorry to see you go.');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  sendRegistrationOTP,
  sendOtpValidation,
  verifyRegistrationOTP,
  verifyOtpValidation,
  completeRegistration,
  completeRegistrationValidation,
  login,
  loginValidation,
  loginWithGoogle,
  googleLoginValidation,
  refreshToken,
  getProfile,
  updateProfile,
  forgotPasswordSendOTP,
  forgotPasswordVerifyOTP,
  resetPassword,
  forgotPasswordValidation,
  resetPasswordValidation,
  changePassword,
  changePasswordValidation,
  changeEmailSendOTP,
  changeEmailVerifyOTP,
  changeEmailSendValidation,
  changeEmailVerifyValidation,
  deleteAccount,
};
