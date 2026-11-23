require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const {
  helmetMiddleware,
  apiRateLimiter,
  sessionMiddleware,
} = require('./src/middleware/security');
const prisma = require('./src/config/database');
const { seedAdmin } = require('./src/config/seed');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy on Vercel / reverse proxy
app.set('trust proxy', 1);

// ──────────────────────────────────────────────
// MIDDLEWARE STACK
// ──────────────────────────────────────────────

// Security headers
app.use(helmetMiddleware());

// CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.ALLOWED_ORIGIN || false
    : true,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use('/api/', apiRateLimiter());

// Sessions
app.use(sessionMiddleware());

// Prevent direct unauthenticated static access to protected admin and student HTML files
app.use((req, res, next) => {
  const normalizedPath = req.path.toLowerCase();

  // If requesting an admin HTML page directly
  if (normalizedPath.startsWith('/admin/') && normalizedPath.endsWith('.html')) {
    const page = normalizedPath.replace(/^\/admin\//, '').replace(/\.html$/, '');
    if (page !== 'login') {
      if (!req.session || !req.session.userId) {
        return res.redirect('/admin/login');
      }
      if (req.session.role !== 'ADMIN') {
        return res.redirect('/student/dashboard');
      }
    }
  }

  // If requesting a student HTML page directly
  if (normalizedPath.startsWith('/student/') && normalizedPath.endsWith('.html')) {
    const page = normalizedPath.replace(/^\/student\//, '').replace(/\.html$/, '');
    if (page !== 'login') {
      if (!req.session || !req.session.userId) {
        return res.redirect('/student/login');
      }
      if (req.session.role === 'ADMIN') {
        return res.redirect('/admin/dashboard');
      }
    }
  }

  next();
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// ──────────────────────────────────────────────
// ROUTES
// ──────────────────────────────────────────────

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      environment: process.env.NODE_ENV || 'development',
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: process.env.NODE_ENV === 'production' ? 'Database error' : error.message,
    });
  }
});

// API routes
app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/admin', require('./src/routes/admin.routes'));
app.use('/api/academic-years', require('./src/routes/academicYear.routes'));
app.use('/api/exams', require('./src/routes/exam.routes'));
app.use('/api/excel', require('./src/routes/excel.routes'));
app.use('/api/exam-data', require('./src/routes/examData.routes'));
app.use('/api/seating', require('./src/routes/seating.routes'));
app.use('/api/block-labels', require('./src/routes/blockLabel.routes'));
app.use('/api/eligibility', require('./src/routes/eligibility.routes'));
app.use('/api/hall-ticket', require('./src/routes/hallTicket.routes'));
app.use('/api/student', require('./src/routes/student.routes'));
app.use('/api/block-report', require('./src/routes/blockReport.routes'));
app.use('/api/audit', require('./src/routes/audit.routes'));
app.use('/api/subjects', require('./src/routes/subjectMaster.routes'));
app.use('/api/eligible-analysis', require('./src/routes/eligibleAnalysis.routes'));

// ──────────────────────────────────────────────
// PAGE ROUTES (Server-side Authentication & Role Guarding)
// ──────────────────────────────────────────────

// Root → Redirect based on session or show Admin login
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    if (req.session.role === 'ADMIN') return res.redirect('/admin/dashboard');
    if (req.session.role === 'STUDENT') return res.redirect('/student/dashboard');
  }
  res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html'));
});

// Admin pages with server-side authentication & authorization
app.get('/admin/:page', (req, res) => {
  const page = (req.params.page || 'login').replace(/\.html$/, '');

  if (page === 'login') {
    if (req.session && req.session.userId && req.session.role === 'ADMIN') {
      return res.redirect('/admin/dashboard');
    }
    return res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html'));
  }

  // Protected Admin pages
  if (!req.session || !req.session.userId) {
    return res.redirect('/admin/login');
  }
  if (req.session.role !== 'ADMIN') {
    return res.redirect('/student/dashboard');
  }

  const filePath = path.join(__dirname, 'public', 'admin', `${page}.html`);
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).send('Page not found');
  });
});

// Student pages with server-side authentication & authorization
app.get('/student/:page', (req, res) => {
  const page = (req.params.page || 'login').replace(/\.html$/, '');

  if (page === 'login') {
    if (req.session && req.session.userId && req.session.role === 'STUDENT') {
      return res.redirect('/student/dashboard');
    }
    return res.sendFile(path.join(__dirname, 'public', 'student', 'login.html'));
  }

  // Protected Student pages
  if (!req.session || !req.session.userId) {
    return res.redirect('/student/login');
  }
  if (req.session.role !== 'STUDENT') {
    return res.redirect('/admin/dashboard');
  }

  const filePath = path.join(__dirname, 'public', 'student', `${page}.html`);
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).send('Page not found');
  });
});

// ──────────────────────────────────────────────
// ERROR HANDLING
// ──────────────────────────────────────────────

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

// ──────────────────────────────────────────────
// SERVER STARTUP
// ──────────────────────────────────────────────

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('[DB] Connected to Neon PostgreSQL');

    // Seed admin account
    await seedAdmin();

    // Start server
    app.listen(PORT, () => {
      console.log(`[Server] Running on http://localhost:${PORT}`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('[Server] Failed to start:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  console.log('[Server] Disconnected from database');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

// Start the server (not in Vercel serverless)
if (!process.env.VERCEL) {
  startServer();
}

// Export for Vercel
module.exports = app;
