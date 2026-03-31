jest.mock('../server/models/User', () => ({
  findOne: jest.fn(),
  findByPk: jest.fn(),
}));

jest.mock('../server/utils/tokenUtils', () => ({
  generateTokenPair: jest.fn(),
  verifyRefreshToken: jest.fn(),
}));

jest.mock('../server/services/googleAuthService', () => ({
  verifyGoogleCredential: jest.fn(),
}));

jest.mock('../server/utils/usernameUtils', () => ({
  generateUniqueUsername: jest.fn(),
}));

jest.mock('../server/services/otpService', () => ({
  createOTP: jest.fn(),
  verifyOTP: jest.fn(),
  isEmailVerified: jest.fn(),
  consumeOTP: jest.fn(),
  sendOTPEmail: jest.fn(),
}));

const User = require('../server/models/User');
const {
  createOTP,
  verifyOTP,
  consumeOTP,
  sendOTPEmail,
} = require('../server/services/otpService');

const authController = require('../server/controllers/authController');

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('authController account flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('forgotPasswordSendOTP succeeds generically for unknown emails', async () => {
    User.findOne.mockResolvedValue(null);
    const res = createRes();

    await authController.forgotPasswordSendOTP(
      { body: { email: 'missing@example.com' } },
      res,
      jest.fn()
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'If this email is registered, a reset code has been sent.',
    }));
  });

  test('forgotPasswordSendOTP blocks Google-managed accounts', async () => {
    User.findOne.mockResolvedValue({ firebase_uid: 'google:abc', hashed_password: null });
    const res = createRes();

    await authController.forgotPasswordSendOTP(
      { body: { email: 'google@example.com' } },
      res,
      jest.fn()
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: 'GOOGLE_ACCOUNT',
    }));
  });

  test('changePassword blocks Google-managed accounts', async () => {
    const req = {
      body: { currentPassword: 'OldPass123', newPassword: 'NewPass123' },
      user: { firebase_uid: 'google:abc', hashed_password: null },
    };
    const res = createRes();

    await authController.changePassword(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: 'GOOGLE_ACCOUNT',
    }));
  });

  test('changePassword updates local-account passwords', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const req = {
      body: { currentPassword: 'OldPass123', newPassword: 'NewPass123' },
      user: {
        firebase_uid: null,
        hashed_password: 'hash',
        comparePassword: jest.fn().mockResolvedValue(true),
        update,
      },
    };
    const res = createRes();

    await authController.changePassword(req, res, jest.fn());

    expect(update).toHaveBeenCalledWith({ hashed_password: 'NewPass123' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('changeEmailSendOTP rejects duplicate emails', async () => {
    User.findOne.mockResolvedValue({ id: 2 });
    const req = {
      body: { newEmail: 'taken@example.com' },
      user: { email: 'current@example.com', firebase_uid: null },
    };
    const res = createRes();

    await authController.changeEmailSendOTP(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: 'DUPLICATE_EMAIL',
    }));
  });

  test('changeEmailSendOTP sends OTP to a new email', async () => {
    User.findOne.mockResolvedValue(null);
    createOTP.mockReturnValue({ success: true, code: '123456', expiresIn: 600 });
    sendOTPEmail.mockResolvedValue({ success: true });
    const req = {
      body: { newEmail: 'new@example.com' },
      user: { email: 'current@example.com', firebase_uid: null },
    };
    const res = createRes();

    await authController.changeEmailSendOTP(req, res, jest.fn());

    expect(createOTP).toHaveBeenCalledWith('new@example.com');
    expect(sendOTPEmail).toHaveBeenCalledWith('new@example.com', '123456');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('changeEmailVerifyOTP updates the authenticated user email', async () => {
    verifyOTP.mockReturnValue({ success: true });
    User.findOne.mockResolvedValue(null);
    const update = jest.fn().mockResolvedValue(undefined);
    const req = {
      body: { newEmail: 'updated@example.com', code: '123456' },
      user: {
        id: 1,
        email: 'current@example.com',
        firebase_uid: null,
        update,
        toSafeJSON: jest.fn().mockReturnValue({ email: 'updated@example.com', auth_provider: 'local' }),
      },
    };
    const res = createRes();

    await authController.changeEmailVerifyOTP(req, res, jest.fn());

    expect(update).toHaveBeenCalledWith({ email: 'updated@example.com', verified_email: true });
    expect(consumeOTP).toHaveBeenCalledWith('updated@example.com');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('deleteAccount deactivates the current user', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const req = { user: { update } };
    const res = createRes();

    await authController.deleteAccount(req, res, jest.fn());

    expect(update).toHaveBeenCalledWith({ is_active: false });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
