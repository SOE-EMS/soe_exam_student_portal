/**
 * Authentication & Authorization Middleware
 * Implements RBAC for Admin and Student roles
 */

/**
 * Require any authenticated user
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required. Please login.' });
  }
  next();
}

/**
 * Require Admin role
 */
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required. Please login.' });
  }
  if (req.session.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
  }
  next();
}

/**
 * Require Student role
 */
function requireStudent(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required. Please login.' });
  }
  if (req.session.role !== 'STUDENT') {
    return res.status(403).json({ error: 'Access denied. Student account required.' });
  }
  next();
}

/**
 * Prevent session fixation — regenerate session ID after login
 */
function regenerateSession(req, userData) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userData.userId;
      req.session.role = userData.role;
      req.session.email = userData.email || null;
      req.session.enrollmentNumber = userData.enrollmentNumber || null;
      req.session.save((saveErr) => {
        if (saveErr) return reject(saveErr);
        resolve();
      });
    });
  });
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireStudent,
  regenerateSession,
};
