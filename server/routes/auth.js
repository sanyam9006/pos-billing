const express = require('express');
const router = express.Router();
const db = require('../db');
const { hashPin, verifyPin, generateToken, checkRateLimit, recordFailedAttempt, resetAttempts, authMiddleware, requireRole } = require('../utils/auth');
const { logAudit } = require('../utils/audit');

// ── GET /api/auth/status — Check if first-run setup is required ──
router.get('/status', (req, res) => {
  const countRow = db.prepare('SELECT COUNT(*) as count FROM cashiers WHERE is_active = 1').get();
  res.json({
    needs_setup: (countRow ? countRow.count : 0) === 0,
    has_users: (countRow ? countRow.count : 0) > 0
  });
});

// ── POST /api/auth/setup — First-run owner account setup ──
router.post('/setup', (req, res) => {
  const countRow = db.prepare('SELECT COUNT(*) as count FROM cashiers WHERE is_active = 1').get();
  if (countRow && countRow.count > 0) {
    return res.status(400).json({ error: 'System is already initialized. Please login normally.' });
  }

  const { name, employee_code = 'OWNER01', pin } = req.body;
  if (!name || !pin || String(pin).length < 4) {
    return res.status(400).json({ error: 'Owner name and a PIN with at least 4 digits are required.' });
  }

  const result = db.prepare(`
    INSERT INTO cashiers (name, employee_code, pin, role)
    VALUES (?, ?, ?, 'supervisor')
  `).run(name.trim(), employee_code.trim(), hashPin(String(pin)));

  const owner = db.prepare('SELECT id, name, employee_code, role FROM cashiers WHERE id = ?').get(result.lastInsertRowid);
  const token = generateToken(owner);

  logAudit({
    cashier_id: owner.id,
    cashier_name: owner.name,
    action: 'first_run_setup',
    entity_type: 'cashier',
    entity_id: owner.id,
    details: { employee_code: owner.employee_code }
  });

  res.status(201).json({
    success: true,
    message: 'Boutique Owner account configured successfully.',
    token,
    cashier: owner
  });
});

// ── POST /api/auth/login — Cashier / Supervisor Login ──
router.post('/login', (req, res) => {
  const { employee_code, pin } = req.body;
  if (!employee_code || !pin) {
    return res.status(400).json({ error: 'Employee code and PIN required' });
  }

  const rateCheck = checkRateLimit(employee_code);
  if (!rateCheck.allowed) {
    return res.status(429).json({ error: rateCheck.message });
  }

  const cashier = db.prepare(
    'SELECT id, name, employee_code, pin, role FROM cashiers WHERE employee_code = ? AND is_active = 1'
  ).get(employee_code);

  if (!cashier || !verifyPin(String(pin), cashier.pin)) {
    recordFailedAttempt(employee_code);
    return res.status(401).json({ error: 'Invalid employee code or PIN' });
  }

  resetAttempts(employee_code);
  const token = generateToken(cashier);

  const cashierData = { ...cashier };
  delete cashierData.pin;

  res.json({ success: true, token, cashier: cashierData });
});

// ── GET /api/auth/cashiers — List all staff (supervisor only) ──
router.get('/cashiers', authMiddleware, requireRole('supervisor'), (req, res) => {
  const staff = db.prepare('SELECT id, name, employee_code, role, is_active, created_at FROM cashiers ORDER BY id ASC').all();
  res.json(staff);
});

// ── POST /api/auth/cashiers — Create new staff member (supervisor only) ──
router.post('/cashiers', authMiddleware, requireRole('supervisor'), (req, res) => {
  const { name, employee_code, pin, role = 'cashier' } = req.body;
  if (!name || !employee_code || !pin) {
    return res.status(400).json({ error: 'Name, employee code, and PIN are required' });
  }

  const existing = db.prepare('SELECT id FROM cashiers WHERE employee_code = ?').get(employee_code);
  if (existing) {
    return res.status(409).json({ error: `Employee code ${employee_code} already exists` });
  }

  const result = db.prepare(`
    INSERT INTO cashiers (name, employee_code, pin, role) VALUES (?, ?, ?, ?)
  `).run(name.trim(), employee_code.trim(), hashPin(String(pin)), role);

  const created = db.prepare('SELECT id, name, employee_code, role, is_active FROM cashiers WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// ── POST /api/auth/logout ──
router.post('/logout', (req, res) => {
  res.json({ success: true });
});

module.exports = router;
