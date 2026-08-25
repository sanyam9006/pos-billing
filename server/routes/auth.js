const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyPin, generateToken, checkRateLimit, recordFailedAttempt, resetAttempts } = require('../utils/auth');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { employee_code, pin } = req.body;
  if (!employee_code || !pin) {
    return res.status(400).json({ error: 'Employee code and PIN required' });
  }

  // Rate limiting
  const rateCheck = checkRateLimit(employee_code);
  if (!rateCheck.allowed) {
    return res.status(429).json({ error: rateCheck.message });
  }

  const cashier = db.prepare(
    'SELECT id, name, employee_code, pin, role FROM cashiers WHERE employee_code = ? AND is_active = 1'
  ).get(employee_code);

  if (!cashier || !verifyPin(pin, cashier.pin)) {
    recordFailedAttempt(employee_code);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Success — reset attempts and issue token
  resetAttempts(employee_code);
  const token = generateToken(cashier);

  // Don't send the PIN hash back to the client
  const { pin: _, ...cashierData } = cashier;

  res.json({ success: true, token, cashier: cashierData });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.json({ success: true });
});

module.exports = router;
