const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireRole } = require('../utils/auth');

// ── GET /api/suppliers — List suppliers ──
router.get('/', (req, res) => {
  const suppliers = db.prepare('SELECT id, name, contact_person, phone, email, address, is_active, created_at FROM suppliers WHERE is_active = 1 ORDER BY name').all();
  res.json(suppliers);
});

// ── POST /api/suppliers — Create supplier (supervisor only) ──
router.post('/', requireRole('supervisor'), (req, res) => {
  const { name, contact_person, phone, email, address } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Supplier name is required' });
  }

  const result = db.prepare(`
    INSERT INTO suppliers (name, contact_person, phone, email, address)
    VALUES (?, ?, ?, ?, ?)
  `).run(name.trim(), contact_person || null, phone || null, email || null, address || null);

  const supplier = db.prepare('SELECT id, name, contact_person, phone, email, address, is_active, created_at FROM suppliers WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(supplier);
});

// ── PUT /api/suppliers/:id — Update supplier (supervisor only) ──
router.put('/:id', requireRole('supervisor'), (req, res) => {
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

  const { name, contact_person, phone, email, address } = req.body;

  db.prepare(`
    UPDATE suppliers SET
      name = COALESCE(?, name),
      contact_person = COALESCE(?, contact_person),
      phone = COALESCE(?, phone),
      email = COALESCE(?, email),
      address = COALESCE(?, address)
    WHERE id = ?
  `).run(name || null, contact_person || null, phone || null, email || null, address || null, req.params.id);

  const updated = db.prepare('SELECT id, name, contact_person, phone, email, address, is_active, created_at FROM suppliers WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// ── DELETE /api/suppliers/:id — Soft-delete supplier (supervisor only) ──
router.delete('/:id', requireRole('supervisor'), (req, res) => {
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

  db.prepare('UPDATE suppliers SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: `Supplier "${supplier.name}" removed` });
});

module.exports = router;
