const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);

/**
 * Helmet security headers
 */
function helmetMiddleware() {
  return helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });
}

/**
 * General API rate limiter
 */
function apiRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/**
 * Strict rate limiter for auth endpoints (brute-force protection)
 */
function authRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per 15 min
    message: { error: 'Too many login attempts, please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/**
 * Session middleware with PostgreSQL store
 */
function sessionMiddleware() {
  let store;
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres')) {
    store = new pgSession({
      conString: process.env.DATABASE_URL,
      tableName: 'session',
      createTableIfMissing: true,
    });
  } else {
    store = new session.MemoryStore();
  }

  const sessionConfig = {
    store: store,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: 'soe.sid',
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  };

  return session(sessionConfig);
}

module.exports = {
  helmetMiddleware,
  apiRateLimiter,
  authRateLimiter,
  sessionMiddleware,
};
