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

// Import granular rate limiters
const { authLimiter, chatLimiter, insightLimiter, generalLimiter } = require('./middleware/rateLimiter');

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

// CORS — production-ready with configurable origins
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim());
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'LifeSync API is running.',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
  });
});

// Register route modules with granular rate limiters
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/health-logs', healthRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/chat', chatLimiter, chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/insights', insightLimiter, insightsRoutes);
app.use('/api/external', externalRoutes);

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
    await db.sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    console.log('✅ Database tables synchronized.');

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
