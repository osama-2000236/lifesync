// tests/observability.test.js
// ============================================
// P5 observability: the health probe tells the truth about MySQL/Redis, the
// error handler emits one structured greppable line (sanitized in prod), and
// fatal events produce a parseable last-gasp log.
// ============================================

const request = require('supertest');
const { sequelize } = require('../server/config/database');
const { app, _logFatal, _resetDbProbeForTests } = require('../server/app');
const { errorHandler, AppError } = require('../server/middleware/errorHandler');

// Spy on the real instance (a module mock would break sequelize.define in models).
let authSpy;
beforeEach(() => {
  authSpy = jest.spyOn(sequelize, 'authenticate');
  _resetDbProbeForTests();
});
afterEach(() => authSpy.mockRestore());

describe('/api/health honesty', () => {
  test('reports db.ok=true and uptime when MySQL answers', async () => {
    authSpy.mockResolvedValue();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.db).toEqual({ ok: true });
    expect(res.body.uptime_s).toBeGreaterThanOrEqual(0);
    expect(res.body.redis.mode).toBe('memory'); // no REDIS_URL under jest
  });

  test('stays 200 (liveness) but reports db.ok=false when MySQL is down', async () => {
    authSpy.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.db).toEqual({ ok: false });
  });

  test('db probe result is cached — repeated polls do not re-ping MySQL', async () => {
    authSpy.mockResolvedValue();
    await request(app).get('/api/health');
    await request(app).get('/api/health');
    expect(sequelize.authenticate).toHaveBeenCalledTimes(1);
  });

  test('a hung MySQL cannot hang the probe (timeout-bounded)', async () => {
    authSpy.mockImplementation(() => new Promise(() => {})); // never settles
    const started = Date.now();
    const res = await request(app).get('/api/health');
    expect(res.body.db).toEqual({ ok: false });
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe('errorHandler structured log line', () => {
  const mockRes = () => {
    const res = { statusCode: null, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
  };
  const req = { method: 'POST', originalUrl: '/api/chat' };

  test('5xx emits one parseable JSON line with method/path/status', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      errorHandler(new Error('db exploded'), req, mockRes());
      const lines = spy.mock.calls.map((c) => c[0]).filter((l) => String(l).includes('request_error'));
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toMatchObject({
        level: 'error', msg: 'request_error', status: 500,
        method: 'POST', path: '/api/chat', error: 'db exploded',
      });
    } finally {
      spy.mockRestore();
    }
  });

  test('production hides internal messages from clients but keeps them in the log', () => {
    const saved = process.env.NODE_ENV;
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      process.env.NODE_ENV = 'production';
      const res = mockRes();
      errorHandler(new Error('SELECT * FROM users failed at 10.0.0.5'), req, res);
      expect(res.body.error).toBe('Internal server error'); // client sees nothing internal
      const logged = JSON.parse(spy.mock.calls[0][0]);
      expect(logged.error).toContain('10.0.0.5'); // ops still sees the real cause
      expect(logged.stack).toBeUndefined(); // greppable one-liners in prod
    } finally {
      process.env.NODE_ENV = saved;
      spy.mockRestore();
    }
  });

  test('operational AppError keeps its safe client message in production', () => {
    const saved = process.env.NODE_ENV;
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      process.env.NODE_ENV = 'production';
      const res = mockRes();
      errorHandler(new AppError('Upstream model busy', 503, 'MODEL_BUSY'), req, res);
      expect(res.body.error).toBe('Upstream model busy');
      expect(res.body.code).toBe('MODEL_BUSY');
    } finally {
      process.env.NODE_ENV = saved;
      spy.mockRestore();
    }
  });
});

describe('fatal last-gasp logger', () => {
  test('emits parseable JSON with compressed stack; never throws on junk input', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      _logFatal('unhandled_rejection', new Error('boom'));
      const line = JSON.parse(spy.mock.calls[0][0]);
      expect(line).toMatchObject({ level: 'fatal', msg: 'unhandled_rejection', error: 'boom' });
      expect(line.stack).toContain('|'); // multi-frame stack on ONE line
      expect(line.stack.split('|').length).toBeLessThanOrEqual(6);

      expect(() => _logFatal('uncaught_exception', undefined)).not.toThrow();
      expect(() => _logFatal('uncaught_exception', 'string reason')).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});
