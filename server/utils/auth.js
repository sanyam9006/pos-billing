const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');

const SALT_ROUNDS = 10;
const JWT_EXPIRY = '24h';

function getJwtSecret() {
  if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET === 'pos-secret-change-in-production') {
    throw new Error('FATAL: Default JWT_SECRET is not permitted in production. Set a secure JWT_SECRET in .env');
  }
  if (process.env.JWT_SECRET && process.env.JWT_SECRET !== 'pos-secret-change-in-production') {
    return process.env.JWT_SECRET;
  }
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'SYSTEM_JWT_SECRET'").get();
    if (row && row.value) return row.value;
    const generated = crypto.randomBytes(32).toString('hex');
    db.prepare("INSERT OR REPLACE INTO settings (key, value, description) VALUES ('SYSTEM_JWT_SECRET', ?, 'Auto-generated secure system JWT secret')").run(generated);
    return generated;
  } catch (_) {
    return 'development-temporary-jwt-secret-key-12345';
  }
}

const JWT_SECRET = getJwtSecret();

// ── PIN Hashing ──
function hashPin(pin) {
  return bcrypt.hashSync(pin, SALT_ROUNDS);
}

function verifyPin(pin, hash) {
  return bcrypt.compareSync(pin, hash);
}

// ── JWT ──
function generateToken(cashier) {
  return jwt.sign(
    { id: cashier.id, name: cashier.name, employee_code: cashier.employee_code, role: cashier.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// ── Auth Middleware ──
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.cashier = decoded;
  next();
}

// ── Role Enforcement Middleware ──
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.cashier) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.cashier.role)) {
      return res.status(403).json({ error: `This action requires ${roles.join(' or ')} role` });
    }
    next();
  };
}

// ── Login Rate Limiting (in-memory) ──
const loginAttempts = new Map(); // employee_code -> { count, lockedUntil }
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;

function checkRateLimit(employeeCode) {
  const record = loginAttempts.get(employeeCode);
  if (!record) return { allowed: true };

  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const remainingSecs = Math.ceil((record.lockedUntil - Date.now()) / 1000);
    return { allowed: false, message: `Account locked. Try again in ${remainingSecs} seconds.` };
  }

  // Lock expired — reset
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    loginAttempts.delete(employeeCode);
    return { allowed: true };
  }

  return { allowed: true };
}

function recordFailedAttempt(employeeCode) {
  const record = loginAttempts.get(employeeCode) || { count: 0, lockedUntil: null };
  record.count += 1;

  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
  }

  loginAttempts.set(employeeCode, record);
}

function resetAttempts(employeeCode) {
  loginAttempts.delete(employeeCode);
}

module.exports = {
  hashPin,
  verifyPin,
  generateToken,
  verifyToken,
  authMiddleware,
  requireRole,
  checkRateLimit,
  recordFailedAttempt,
  resetAttempts
};
