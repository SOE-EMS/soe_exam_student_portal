const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);

/**
 * Helmet security headers with tuned Content Security Policy (CSP)
 */
function helmetMiddleware() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com',
          'https://cdn.tailwindcss.com',
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com',
          'https://fonts.googleapis.com',
        ],
        fontSrc: [
          "'self'",
          'https://cdnjs.cloudflare.com',
          'https://fonts.gstatic.com',
          'data:',
        ],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://res.cloudinary.com',
        ],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  });
}

/**
 * General API rate limiter (prevents abuse while allowing peak exam download traffic)
 */
function apiRateLimiter() {
  const maxRequests = parseInt(process.env.API_RATE_LIMIT_MAX, 10) || 300;
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: maxRequests,
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
