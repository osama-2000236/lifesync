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
const { initializeFirebase } = require('./config/firebase');
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

// Import granular rate limiters
const { chatLimiter, insightLimiter, generalLimiter } = require('./middleware/rateLimiter');

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
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'LifeSync API is running.',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    commit: COMMIT_SHA,
    env: process.env.NODE_ENV || 'development',
  });
});

// Register route modules with granular rate limiters
app.use('/api/auth', authRoutes);
app.use('/api/health-logs', healthRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/chat', chatLimiter, chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/insights', insightLimiter, insightsRoutes);
app.use('/api/external', externalRoutes);
app.use('/api/ai', generalLimiter, aiRoutes);
app.use('/api/voice', generalLimiter, voiceRoutes);
app.use('/api/assistant', generalLimiter, assistantRoutes);
app.use('/api/memory', generalLimiter, memoryRoutes);

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
    // Test MySQL connection
    await testConnection();

    // Sync database (creates tables if they don't exist)
    const db = require('./models');
    await db.sequelize.sync({ alter: process.env.DB_ALTER === 'true' });
    console.log('✅ Database tables synchronized (alter: ' + (process.env.DB_ALTER === 'true') + ').');

    // Initialize Firebase (non-blocking)
    initializeFirebase();

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

// Only start if not being required by tests
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
