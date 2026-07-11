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

const express = require('express');
const request = require('supertest');
const externalRoutes = require('../server/routes/externalRoutes');

const app = express();
app.use(express.json());
app.use('/api/external', externalRoutes);

describe('OAuth callback state binding', () => {
  test('client-supplied identity in state is rejected (the old JSON contract)', async () => {
    const res = await request(app)
      .get('/api/external/callback/google_fit')
      .query({ code: 'auth-code', state: JSON.stringify({ userId: 999, platform: 'google_fit' }) });
    expect(res.status).toBe(400);
  });

  test('unknown / missing state is rejected', async () => {
    const forged = await request(app)
      .get('/api/external/callback/google_fit')
      .query({ code: 'auth-code', state: 'not-a-known-nonce' });
    expect(forged.status).toBe(400);
    const missing = await request(app)
      .get('/api/external/callback/google_fit')
      .query({ code: 'auth-code' });
    expect(missing.status).toBe(400);
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
    expect(cb.status).toBe(302); // success redirect to dashboard

    // Replay of a consumed nonce must fail (single-use).
    const replay = await request(app)
      .get('/api/external/callback/google_fit')
      .query({ code: 'auth-code', state });
    expect(replay.status).toBe(400);
  });

  test('nonce is bound to the platform it was issued for', async () => {
    const connect = await request(app).get('/api/external/connect/google_fit');
    const state = new URL(connect.body.data.url).searchParams.get('state');
    const res = await request(app)
      .get('/api/external/callback/apple_health')
      .query({ code: 'auth-code', state });
    expect(res.status).toBe(400);
  });

  test('callback binds tokens to the connect initiator: sync works after the real flow', async () => {
    const connect = await request(app).get('/api/external/connect/google_fit');
    const state = new URL(connect.body.data.url).searchParams.get('state');
    await request(app).get('/api/external/callback/google_fit').query({ code: 'auth-code', state });
    const status = await request(app).get('/api/external/status');
    expect(status.body.data.platforms.google_fit.connected).toBe(true);
  });
});
