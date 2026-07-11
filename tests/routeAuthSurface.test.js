// tests/routeAuthSurface.test.js
// Unauthenticated hits on protected mounts; admin stack; public health.
const request = require('supertest');
const { app } = require('../server/app');

describe('route auth surface (integration, no token)', () => {
  test('public health probe is open', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test.each([
    ['get', '/api/health-logs'],
    ['get', '/api/health-logs/1'],
    ['put', '/api/health-logs/1'],
    ['delete', '/api/health-logs/1'],
    ['get', '/api/finance'],
    ['get', '/api/finance/1'],
    ['put', '/api/finance/1'],
    ['delete', '/api/finance/1'],
    ['get', '/api/chat/history'],
    ['get', '/api/chat/sessions'],
    ['post', '/api/chat'],
    ['get', '/api/admin/dashboard'],
    ['get', '/api/admin/users'],
    ['get', '/api/insights'],
    ['put', '/api/insights/1/read'],
    ['get', '/api/assistant/suggestion'],
    ['get', '/api/memory'],
    ['put', '/api/memory/1'],
    ['delete', '/api/memory/1'],
    ['delete', '/api/memory'],
    ['post', '/api/voice/speak'],
    ['get', '/api/auth/me'],
  ])('%s %s → 401 without token', async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  test('login validation rejects empty body', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
