const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { employee_code, pin } = req.body;
  if (!employee_code || !pin) {
    return res.status(400).json({ error: 'Employee code and PIN required' });
  }

  const cashier = db.prepare(
    'SELECT id, name, employee_code, role FROM cashiers WHERE employee_code = ? AND pin = ? AND is_active = 1'
  ).get(employee_code, pin);

  if (!cashier) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  res.json({ success: true, cashier });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.json({ success: true });
});

module.exports = router;
