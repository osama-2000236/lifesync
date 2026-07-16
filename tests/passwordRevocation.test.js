// tests/passwordRevocation.test.js
// ============================================
// P6: a password change/reset revokes every JWT issued before it — at the
// refresh endpoint AND per-request in the auth middleware. Plus the login
// timing equalizer (unknown email burns the same bcrypt cost as a wrong
// password, so response time is not an account-existence oracle).
// ============================================

jest.mock('../server/models/User', () => ({
  findOne: jest.fn(),
  findByPk: jest.fn(),
}));
jest.mock('../server/services/googleAuthService', () => ({
  verifyGoogleCredential: jest.fn(),
}));
jest.mock('../server/utils/usernameUtils', () => ({
  generateUniqueUsername: jest.fn(),
}));

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  process.env.JWT_SECRET = 'test-jwt-secret-min-16-chars!!';
}
if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 16) {
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-16chars!';
}

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../server/models/User');
const { issuedBeforePasswordChange } = require('../server/utils/tokenUtils');
const { authenticate } = require('../server/middleware/auth');
const authController = require('../server/controllers/authController');

const NOW_S = Math.floor(Date.now() / 1000);
// expiresIn counts from the (backdated) iat — keep it wide so exp stays future.
const signAccess = (iat) => jwt.sign(
  { id: 7, email: 'a@b.com', role: 'user', iat },
  process.env.JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '12h' },
);
const signRefresh = (iat) => jwt.sign(
  { id: 7, iat },
  process.env.JWT_REFRESH_SECRET,
  { algorithm: 'HS256', expiresIn: '30d' },
);

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => jest.clearAllMocks());

describe('issuedBeforePasswordChange', () => {
  const user = (changedAt) => ({ password_changed_at: changedAt });

  test('never-changed password revokes nothing', () => {
    expect(issuedBeforePasswordChange({ iat: NOW_S - 9999 }, user(null))).toBe(false);
  });

  test('token older than the change is revoked', () => {
    expect(issuedBeforePasswordChange(
      { iat: NOW_S - 3600 }, user(new Date(NOW_S * 1000)),
    )).toBe(true);
  });

  test('token minted after the change survives', () => {
    expect(issuedBeforePasswordChange(
      { iat: NOW_S }, user(new Date((NOW_S - 3600) * 1000)),
    )).toBe(false);
  });

  test('same-second replacement tokens survive the 2s slack', () => {
    // change at NOW.500, replacement token iat floored to NOW — must NOT die.
    expect(issuedBeforePasswordChange(
      { iat: NOW_S }, user(new Date(NOW_S * 1000 + 500)),
    )).toBe(false);
  });
});

describe('refresh endpoint revocation', () => {
  test('refresh token issued BEFORE the password change is rejected', async () => {
    User.findByPk.mockResolvedValue({
      id: 7, is_active: true, password_changed_at: new Date(),
    });
    const res = createRes();
    await authController.refreshToken(
      { body: { refreshToken: signRefresh(NOW_S - 3600) } }, res, jest.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_REVOKED' }));
  });

  test('refresh token issued AFTER the change still works', async () => {
    User.findByPk.mockResolvedValue({
      id: 7, is_active: true,
      password_changed_at: new Date((NOW_S - 3600) * 1000),
      toSafeJSON: () => ({ id: 7 }),
    });
    const res = createRes();
    await authController.refreshToken(
      { body: { refreshToken: signRefresh(NOW_S) } }, res, jest.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('auth middleware revocation (per-request)', () => {
  const reqWith = (token) => ({ headers: { authorization: `Bearer ${token}` } });

  test('stolen access token dies on the request after a password change', async () => {
    User.findByPk.mockResolvedValue({
      id: 7, is_active: true, password_changed_at: new Date(),
    });
    const res = createRes();
    const next = jest.fn();
    await authenticate(reqWith(signAccess(NOW_S - 3600)), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_REVOKED' }));
  });

  test('token from after the change passes through', async () => {
    const dbUser = {
      id: 7, is_active: true,
      password_changed_at: new Date((NOW_S - 3600) * 1000),
    };
    User.findByPk.mockResolvedValue(dbUser);
    const res = createRes();
    const next = jest.fn();
    const req = reqWith(signAccess(NOW_S));
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBe(dbUser);
  });
});

describe('login timing equalizer', () => {
  test('unknown email still burns a bcrypt compare (no timing oracle)', async () => {
    User.findOne.mockResolvedValue(null);
    const compareSpy = jest.spyOn(bcrypt, 'compare');
    try {
      const res = createRes();
      await authController.login(
        { body: { email: 'ghost@example.com', password: 'Whatever123' } }, res, jest.fn(),
      );
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_CREDENTIALS' }));
      expect(compareSpy).toHaveBeenCalledTimes(1);
      // Compares against a real cost-12 hash — same work factor as a real user.
      expect(compareSpy.mock.calls[0][1]).toMatch(/^\$2b\$12\$/);
    } finally {
      compareSpy.mockRestore();
    }
  });
});
