// server/routes/authRoutes.js
// ============================================
// Authentication Routes — Two-Step OTP Registration
// ============================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  // Step 1: Send OTP
  sendRegistrationOTP, sendOtpValidation,
  // Step 1.5: Verify OTP
  verifyRegistrationOTP, verifyOtpValidation,
  // Step 2: Complete Registration
  completeRegistration, completeRegistrationValidation,
  // Login + Refresh + Profile
  login, loginValidation,
  refreshToken,
  getProfile, updateProfile,
} = require('../controllers/authController');

// ─── Two-Step Registration ───
router.post('/register/send-otp', sendOtpValidation, validate, sendRegistrationOTP);
router.post('/register/verify-otp', verifyOtpValidation, validate, verifyRegistrationOTP);
router.post('/register/complete', completeRegistrationValidation, validate, completeRegistration);

// ─── Login & Tokens ───
router.post('/login', loginValidation, validate, login);
router.post('/refresh', refreshToken);

// ─── Profile (Protected) ───
router.get('/me', authenticate, getProfile);
router.put('/me', authenticate, updateProfile);

module.exports = router;
