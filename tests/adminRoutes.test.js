// Integration tests — /api/admin (UC-16)

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-32-characters!!';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-32-chars!!';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-for-jest-32ch';
process.env.DISABLE_RATE_LIMITS = '1';

const request = require('supertest');
const { sequelize, User } = require('../server/models');
const { generateTokenPair } = require('../server/utils/tokenUtils');
const { app } = require('../server/app');

jest.mock('../server/services/ai/providerClient', () => ({
  getAIProviderStatus: jest.fn(async (_kind, provider) => {
    if (provider === 'bert_local') return { provider: 'bert_local', status: 'ready' };
    if (provider === 'openrouter') return { provider: 'openrouter', status: 'ready' };
    return { provider: 'openrouter', status: 'ready' };
  }),
}));

jest.mock('../server/services/ephemeralStore', () => {
  const actual = jest.requireActual('../server/services/ephemeralStore');
  return {
    ...actual,
    redisStatus: jest.fn(async () => ({ configured: false, ok: null })),
    redisEnabled: jest.fn(() => false),
  };
});

describe('admin routes (UC-16)', () => {
  let admin;
  let regular;
  let adminToken;
  let userToken;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  beforeEach(async () => {
    await sequelize.sync({ force: true });
    admin = await User.create({
      username: 'admin_ops',
      email: 'admin_ops@test.com',
      hashed_password: 'Password1!',
      verified_email: true,
      is_active: true,
      name: 'Admin Ops',
      role: 'admin',
    });
    regular = await User.create({
      username: 'plain_user',
      email: 'plain@test.com',
      hashed_password: 'Password1!',
      verified_email: true,
      is_active: true,
      name: 'Plain User',
      role: 'user',
    });
    adminToken = generateTokenPair(admin).accessToken;
    userToken = generateTokenPair(regular).accessToken;
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('unauthenticated and non-admin are rejected', async () => {
    await request(app).get('/api/admin/dashboard').expect(401);
    const forbidden = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
    expect(forbidden.body.success).toBe(false);
  });

  test('dashboard returns product + runtime metrics', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data.users.total).toBeGreaterThanOrEqual(2);
    expect(data.users.admins).toBeGreaterThanOrEqual(1);
    expect(data.activity_24h).toMatchObject({
      health_logs: expect.any(Number),
      finance_logs: expect.any(Number),
      chat_messages: expect.any(Number),
    });
    expect(data.product).toMatchObject({
      weekly_reports_total: expect.any(Number),
      weekly_reports_this_week: expect.any(Number),
      notifications_unread: expect.any(Number),
      integrations_connected: expect.any(Number),
    });
    expect(data.runtime.redis.mode).toBe('memory');
    expect(data.runtime.ephemeral_store).toBe('memory');
    expect(data.runtime.ai).toMatchObject({
      bert_status: 'ready',
      openrouter_status: 'ready',
      google_fit_configured: expect.any(Boolean),
    });
    expect(['healthy', 'degraded']).toContain(data.system.status);
  });

  test('users search returns matching accounts', async () => {
    // Ensure OAuth uid exists on a row — must never appear in API JSON.
    await regular.update({ firebase_uid: 'google-oauth-uid-should-not-leak' });

    const list = await request(app)
      .get('/api/admin/users')
      .query({ search: 'plain', limit: 10 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(list.body.success).toBe(true);
    expect(Array.isArray(list.body.data)).toBe(true);
    expect(list.body.data.some((u) => u.username === 'plain_user')).toBe(true);
    expect(list.body.pagination).toBeDefined();
    for (const u of list.body.data) {
      expect(u.hashed_password).toBeUndefined();
      expect(u.firebase_uid).toBeUndefined();
      expect(u.auth_provider).toBeDefined();
    }
    expect(JSON.stringify(list.body)).not.toMatch(/google-oauth-uid|hashed_password/i);
  });

  test('dashboard AI snapshot never includes secret-like keys', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const blob = JSON.stringify(res.body.data.runtime.ai || {});
    expect(blob).not.toMatch(/api[_-]?key|sk-|GOCSPX-|BEGIN PRIVATE/i);
  });

  test('invalid user id on status update is 400', async () => {
    const res = await request(app)
      .put('/api/admin/users/not-a-number/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: false })
      .expect(400);
    expect(res.body.success).toBe(false);
  });

  test('sole admin cannot self-deactivate; second admin can be deactivated', async () => {
    // Sole active admin → self-deactivate blocked (own-account rule).
    const self = await request(app)
      .put(`/api/admin/users/${admin.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: false })
      .expect(400);
    expect(self.body.success).toBe(false);

    const second = await User.create({
      username: 'admin_peer',
      email: 'admin_peer@test.com',
      hashed_password: 'Password1!',
      verified_email: true,
      is_active: true,
      role: 'admin',
    });
    // Two active admins → deactivating the peer is allowed.
    await request(app)
      .put(`/api/admin/users/${second.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: false })
      .expect(200);
    const reloaded = await User.findByPk(second.id);
    expect(reloaded.is_active).toBe(false);
    // Deactivated admin token is rejected at authenticate (is_active).
    await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${generateTokenPair(second).accessToken}`)
      .expect(403);
  });

  test('cannot deactivate own account; can deactivate regular user + audit log', async () => {
    const self = await request(app)
      .put(`/api/admin/users/${admin.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: false })
      .expect(400);
    expect(self.body.success).toBe(false);

    await request(app)
      .put(`/api/admin/users/${regular.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: false })
      .expect(200);

    const reloaded = await User.findByPk(regular.id);
    expect(reloaded.is_active).toBe(false);

    const logs = await request(app)
      .get('/api/admin/logs')
      .query({ log_type: 'audit', limit: 10 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(logs.body.success).toBe(true);
    expect(JSON.stringify(logs.body)).toMatch(/user_deactivated/);
  });

  test('second admin can be deactivated while another admin remains', async () => {
    const second = await User.create({
      username: 'admin_two',
      email: 'admin2@test.com',
      hashed_password: 'Password1!',
      verified_email: true,
      is_active: true,
      name: 'Admin Two',
      role: 'admin',
    });

    await request(app)
      .put(`/api/admin/users/${second.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: false })
      .expect(200);

    const reloaded = await User.findByPk(second.id);
    expect(reloaded.is_active).toBe(false);
  });
});
