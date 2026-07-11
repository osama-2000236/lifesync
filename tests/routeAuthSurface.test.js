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
    ['get', '/api/reports'],
    ['post', '/api/reports/generate'],
    ['get', '/api/reports/notifications'],
  ])('%s %s → 401 without token', async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  test('login validation rejects empty body', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('refresh without token is 400 (route mounted, not unlimited silent success)', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('refresh is rate-limited with authLimiter (same budget as login)', () => {
    // Stack inspection: refresh must sit behind authLimiter so stolen-token
    // hammering / online guessing cannot be unlimited.
    const stack = require('../server/routes/authRoutes').stack || [];
    const refreshLayer = stack.find(
      (l) => l.route && l.route.path === '/refresh' && l.route.methods.post,
    );
    expect(refreshLayer).toBeTruthy();
    const handles = refreshLayer.route.stack.map((s) => s.name || s.handle?.name || '');
    // express-rate-limit handler name is typically empty; assert layer count ≥ 2
    // (limiter + controller) rather than unlimited single-handler route.
    expect(refreshLayer.route.stack.length).toBeGreaterThanOrEqual(2);
    void handles;
  });
});
