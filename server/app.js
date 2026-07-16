// server/app.js
// ============================================
// LifeSync — Express Application Entry Point
// ============================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { testConnection } = require('./config/database');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/authRoutes');
const healthRoutes = require('./routes/healthRoutes');
const financeRoutes = require('./routes/financeRoutes');
const chatRoutes = require('./routes/chatRoutes');
const adminRoutes = require('./routes/adminRoutes');
const insightsRoutes = require('./routes/insightsRoutes');
const externalRoutes = require('./routes/externalRoutes');
const aiRoutes = require('./routes/aiRoutes');
const voiceRoutes = require('./routes/voiceRoutes');
const assistantRoutes = require('./routes/assistantRoutes');
const memoryRoutes = require('./routes/memoryRoutes');
const reportRoutes = require('./routes/reportRoutes');

// Import granular rate limiters
const { chatLimiter, generalLimiter } = require('./middleware/rateLimiter');

// ============================================
// Initialize Express
// ============================================
const app = express();
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);

// ============================================
// Global Middleware
// ============================================

// Security headers
app.use(helmet());

// CORS — production-ready with configurable origins.
// Bake in the known frontends so the API works even if CORS_ORIGIN is unset or
// misconfigured on the host; CORS_ORIGIN (comma-separated) extends this list.
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://lifesync.1202883.workers.dev',
];
const allowedOrigins = [
  ...DEFAULT_ALLOWED_ORIGINS,
  ...(process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean),
];
// credentials:true requires a concrete reflected Origin — never bare "*".
// If CORS_ORIGIN includes "*", treat as allow-any *by reflecting the request
// Origin* (cors package does that when callback(null, true)), not ACAO: *.
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    // Deny cleanly — no CORS headers — instead of throwing (which surfaced as
    // a confusing 500 on every cross-origin request).
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// General rate limiting (catch-all)
app.use('/api/', generalLimiter);

// ============================================
// API Routes
// ============================================

// Health check endpoint (public liveness probe).
// Additive `commit`/`env` fields let deploy verification confirm WHICH build is
// live without querying the platform API. Railway injects RAILWAY_GIT_COMMIT_SHA.
const COMMIT_SHA = (
  process.env.RAILWAY_GIT_COMMIT_SHA
  || process.env.GIT_COMMIT_SHA
  || process.env.SOURCE_VERSION
  || ''
).slice(0, 12) || null;
// DB probe for the health endpoint: cached and timeout-bounded so the public,
// unauthenticated route stays cheap, and never throws so liveness can't 500.
// A 200 that hides a dead MySQL is a lying health check — report db.ok honestly
// (smoke:api fails on db.ok:false; the HTTP status stays 200 = process alive).
let dbProbe = { at: 0, ok: null };
const DB_PROBE_TTL_MS = 10_000;
const dbStatus = async () => {
  if (Date.now() - dbProbe.at < DB_PROBE_TTL_MS) return dbProbe;
  const { sequelize } = require('./config/database');
  let ok = false;
  let timer;
  try {
    await Promise.race([
      sequelize.authenticate(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('db_ping_timeout')), 1500);
      }),
    ]);
    ok = true;
  } catch { /* ok stays false — reported, not thrown */ } finally {
    clearTimeout(timer);
  }
  dbProbe = { at: Date.now(), ok };
  return dbProbe;
};

app.get('/api/health', async (req, res) => {
  // Secret-free readiness: redis + db status for deploy verification; never keys.
  const { redisEnabled, redisStatus } = require('./services/ephemeralStore');
  const [redis, db] = await Promise.all([redisStatus(), dbStatus()]);
  res.status(200).json({
    success: true,
    message: 'LifeSync API is running.',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    commit: COMMIT_SHA,
    env: process.env.NODE_ENV || 'development',
    // Uptime resetting between polls = crash loop, visible without platform access.
    uptime_s: Math.round(process.uptime()),
    db: { ok: db.ok },
    redis: {
      configured: redis.configured,
      ok: redis.ok,
      // When not configured, ephemeral state + rate limits are process-local.
      mode: redis.configured ? 'redis' : 'memory',
    },
    ephemeral_store: redisEnabled() ? 'redis' : 'memory',
  });
});

// Register route modules with granular rate limiters
app.use('/api/auth', authRoutes);
app.use('/api/health-logs', healthRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/chat', chatLimiter, chatRoutes);
app.use('/api/admin', adminRoutes);
// Insight *generation* is rate-limited inside insightsRoutes; reads/history use
// the general API limiter only so a generate burst doesn't block the dashboard.
app.use('/api/insights', insightsRoutes);
app.use('/api/external', externalRoutes);
app.use('/api/ai', generalLimiter, aiRoutes);
app.use('/api/voice', generalLimiter, voiceRoutes);
app.use('/api/assistant', generalLimiter, assistantRoutes);
app.use('/api/memory', generalLimiter, memoryRoutes);
app.use('/api/reports', generalLimiter, reportRoutes);

// ============================================
// Error Handling
// ============================================
app.use(notFound);
app.use(errorHandler);

// ============================================
// Server Startup
// ============================================
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Fail closed on weak/missing secrets BEFORE any DB work or listening.
    const { assertProductionEnv } = require('./config/productionEnv');
    assertProductionEnv();

    // Test MySQL connection
    await testConnection();

    const db = require('./models');

    // Apply pending SQL migrations first (source of truth for production schema).
    // Disable with SKIP_MIGRATIONS=1 for emergency boots.
    if (!['1', 'true', 'yes', 'on'].includes(String(process.env.SKIP_MIGRATIONS || '').toLowerCase())) {
      const { runMigrations } = require('./config/runMigrations');
      const { applied, skipped } = await runMigrations(db.sequelize);
      console.log(`✅ Migrations: ${applied.length} applied, ${skipped.length} already done.`);
    } else {
      console.warn('⚠️  SKIP_MIGRATIONS set — pending migrations not applied.');
    }

    // Lightweight model sync: create any missing tables only. Prefer migrations
    // for column changes; DB_ALTER=true is an emergency escape hatch.
    await db.sequelize.sync({ alter: process.env.DB_ALTER === 'true' });
    console.log('✅ Database tables synchronized (alter: ' + (process.env.DB_ALTER === 'true') + ').');

    // UC-14 weekly report + notification scheduler (hourly; opt out with REPORT_SCHEDULER=0)
    try {
      const { startReportScheduler } = require('./services/reportScheduler');
      startReportScheduler();
    } catch (schedErr) {
      console.warn('[reportScheduler] failed to start:', schedErr.message);
    }

    // Start listening
    app.listen(PORT, () => {
      console.log(`\n🚀 LifeSync server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV}`);
      console.log(`🔗 API: http://localhost:${PORT}/api/health\n`);
    });
  } catch (error) {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  }
};

// Last-gasp structured log for process-fatal events. The platform restarts the
// process; this line is what ops greps to learn WHY. Rare by definition, so a
// compressed stack belongs here (unlike per-request logs, where it would spam).
const logFatal = (evt, err) => {
  try {
    console.error(JSON.stringify({
      level: 'fatal',
      msg: evt,
      name: (err && err.name) || 'Error',
      error: (err && err.message) || String(err),
      stack: String((err && err.stack) || '').split('\n').slice(0, 6).join(' | '),
    }));
  } catch {
    console.error(evt, err);
  }
};

// Only start if not being required by tests
if (require.main === module) {
  // Preserve Node's crash-on-fatal semantics (state is undefined after either
  // event) but emit a greppable line first. Registered only in the real server
  // process — never under Jest, which owns its own handlers.
  process.on('unhandledRejection', (err) => { logFatal('unhandled_rejection', err); process.exit(1); });
  process.on('uncaughtException', (err) => { logFatal('uncaught_exception', err); process.exit(1); });
  startServer();
}

module.exports = {
  app,
  startServer,
  _logFatal: logFatal,
  _resetDbProbeForTests: () => { dbProbe = { at: 0, ok: null }; },
};
