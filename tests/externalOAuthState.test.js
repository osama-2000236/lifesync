// tests/externalOAuthState.test.js
// ============================================
// OAuth state integrity for external integrations.
// The callback is necessarily unauthenticated (provider redirect), so the
// ONLY thing binding it to an account is the state parameter. It must be a
// single-use server-issued nonce — never client-supplied identity data.
// Regression: the callback used to accept a JSON state carrying userId,
// letting any caller choose which account an integration binds to.
// ============================================

jest.mock('../server/middleware/auth', () => ({
  authenticate: (req, _res, next) => { req.user = { id: 1 }; next(); },
}));

jest.mock('../server/services/external/googleFitAdapter', () => jest.fn().mockImplementation(() => ({
  getAuthorizationUrl: (state, redirectUri) => `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`,
  handleCallback: jest.fn(async () => ({ accessToken: 'at', refreshToken: 'rt', expiresIn: 3600 })),
  refreshToken: jest.fn(),
  disconnect: jest.fn(),
})));

jest.mock('../server/services/external/appleHealthAdapter', () => jest.fn().mockImplementation(() => ({
  getAuthorizationUrl: () => ({ type: 'native_sdk' }),
})));

// In-memory stand-in for the user_integrations table (durable token store).
jest.mock('../server/models', () => {
  const rows = [];
  return {
    _rows: rows,
    UserIntegration: {
      findOne: jest.fn(async ({ where }) => rows.find(
        (r) => r.user_id === where.user_id && r.platform === where.platform,
      ) || null),
      findAll: jest.fn(async ({ where }) => rows.filter((r) => r.user_id === where.user_id)),
      create: jest.fn(async (data) => {
        const row = { ...data, update: async (fields) => Object.assign(row, fields) };
        rows.push(row);
        return row;
      }),
      destroy: jest.fn(async ({ where }) => {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          if (rows[i].user_id === where.user_id && rows[i].platform === where.platform) rows.splice(i, 1);
        }
        return before - rows.length;
      }),
    },
  };
});

const express = require('express');
const request = require('supertest');
const externalRoutes = require('../server/routes/externalRoutes');

const app = express();
app.use(express.json());
app.use('/api/external', externalRoutes);

const expectOAuthErrorRedirect = (res, statusFlag) => {
  // Callback is browser-facing: always 302 to the SPA with a status flag.
  expect(res.status).toBe(302);
  expect(res.headers.location).toMatch(/\/integrations\?/);
  expect(res.headers.location).toContain(`status=${statusFlag}`);
};

describe('OAuth callback state binding', () => {
  test('client-supplied identity in state is rejected (the old JSON contract)', async () => {
    const res = await request(app)
      .get('/api/external/callback/google_fit')
      .query({ code: 'auth-code', state: JSON.stringify({ userId: 999, platform: 'google_fit' }) });
    expectOAuthErrorRedirect(res, 'error');
  });

  test('unknown / missing state is rejected', async () => {
    const forged = await request(app)
      .get('/api/external/callback/google_fit')
      .query({ code: 'auth-code', state: 'not-a-known-nonce' });
    expectOAuthErrorRedirect(forged, 'error');
    const missing = await request(app)
      .get('/api/external/callback/google_fit')
      .query({ code: 'auth-code' });
    expectOAuthErrorRedirect(missing, 'error');
  });

  test('connect issues a nonce; callback accepts it once and only once', async () => {
    const connect = await request(app).get('/api/external/connect/google_fit');
    expect(connect.status).toBe(200);
    const state = new URL(connect.body.data.url).searchParams.get('state');
    expect(state).toBeTruthy();
    // Nonce is opaque — carries no identity payload for the client to edit.
    expect(() => {
      const parsed = JSON.parse(state);
      if (parsed && typeof parsed === 'object') throw new Error('object state');
    }).toThrow();

    const cb = await request(app)
      .get('/api/external/callback/google_fit')
      .query({ code: 'auth-code', state });
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toContain('status=connected');

    // Replay of a consumed nonce must fail (single-use) — SPA error redirect.
    const replay = await request(app)
      .get('/api/external/callback/google_fit')
      .query({ code: 'auth-code', state });
    expectOAuthErrorRedirect(replay, 'error');
  });

  test('nonce is bound to the platform it was issued for', async () => {
    const connect = await request(app).get('/api/external/connect/google_fit');
    const state = new URL(connect.body.data.url).searchParams.get('state');
    const res = await request(app)
      .get('/api/external/callback/apple_health')
      .query({ code: 'auth-code', state });
    expectOAuthErrorRedirect(res, 'error');
  });

  test('callback binds tokens to the connect initiator: sync works after the real flow', async () => {
    const connect = await request(app).get('/api/external/connect/google_fit');
    const state = new URL(connect.body.data.url).searchParams.get('state');
    await request(app).get('/api/external/callback/google_fit').query({ code: 'auth-code', state });
    const status = await request(app).get('/api/external/status');
    expect(status.body.data.platforms.google_fit.connected).toBe(true);

    // Durability: tokens live in user_integrations rows keyed to the
    // initiating user — not a process-local Map that dies on deploy.
    const { _rows } = require('../server/models');
    const row = _rows.find((r) => r.platform === 'google_fit');
    expect(row).toMatchObject({ user_id: 1, access_token: 'at', refresh_token: 'rt' });
  });

  test('disconnect removes only the caller-platform row', async () => {
    const res = await request(app).post('/api/external/disconnect/google_fit');
    expect(res.status).toBe(200);
    const status = await request(app).get('/api/external/status');
    expect(status.body.data.platforms.google_fit.connected).toBe(false);
  });
});
