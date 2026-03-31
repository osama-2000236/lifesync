// server/routes/authRoutes.js
// ============================================
// Authentication Routes — OTP registration,
// account recovery, and authenticated profile flows
// ============================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  sendRegistrationOTP, sendOtpValidation,
  verifyRegistrationOTP, verifyOtpValidation,
  completeRegistration, completeRegistrationValidation,
  login, loginValidation,
  loginWithGoogle, googleLoginValidation,
  refreshToken,
  getProfile, updateProfile,
  forgotPasswordSendOTP, forgotPasswordVerifyOTP, resetPassword,
  forgotPasswordValidation, resetPasswordValidation,
  changePassword, changePasswordValidation,
  changeEmailSendOTP, changeEmailVerifyOTP,
  changeEmailSendValidation, changeEmailVerifyValidation,
  deleteAccount,
} = require('../controllers/authController');

// ─── Two-Step Registration ───
router.post('/register/send-otp', sendOtpValidation, validate, sendRegistrationOTP);
router.post('/register/verify-otp', verifyOtpValidation, validate, verifyRegistrationOTP);
router.post('/register/complete', completeRegistrationValidation, validate, completeRegistration);

// ─── Login & Tokens ───
router.post('/login', loginValidation, validate, login);
router.post('/google', googleLoginValidation, validate, loginWithGoogle);
router.post('/refresh', refreshToken);

// ─── Forgot Password (public) ───
router.post('/forgot-password/send-otp', forgotPasswordValidation, validate, forgotPasswordSendOTP);
router.post('/forgot-password/verify-otp', verifyOtpValidation, validate, forgotPasswordVerifyOTP);
router.post('/forgot-password/reset', resetPasswordValidation, validate, resetPassword);

// ─── Profile (Protected) ───
router.get('/me', authenticate, getProfile);
router.put('/me', authenticate, updateProfile);
router.post('/change-password', authenticate, changePasswordValidation, validate, changePassword);
router.post('/change-email/send-otp', authenticate, changeEmailSendValidation, validate, changeEmailSendOTP);
router.post('/change-email/verify-otp', authenticate, changeEmailVerifyValidation, validate, changeEmailVerifyOTP);
router.delete('/me', authenticate, deleteAccount);

module.exports = router;
