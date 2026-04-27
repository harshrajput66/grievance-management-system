// ─── middleware/auth.js ───────────────────────────────────────
const jwt = require('jsonwebtoken');

/**
 * verifyToken — attaches req.user from JWT Bearer token
 */
function verifyToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided.' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

/**
 * requireAdmin — must be used AFTER verifyToken
 */
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  next();
}

/**
 * requireUser — must be used AFTER verifyToken
 */
function requireUser(req, res, next) {
  if (req.user?.role !== 'user') {
    return res.status(403).json({ success: false, message: 'User access required.' });
  }
  next();
}

module.exports = { verifyToken, requireAdmin, requireUser };
