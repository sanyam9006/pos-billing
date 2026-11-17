const express = require('express');
const router = express.Router();
const db = require('../db');
const { logAudit } = require('../utils/audit');

function generateNoteNumber() {
  const now = new Date();
  const ym = now.toISOString().slice(0, 7).replace('-', '');
  const countRow = db.prepare("SELECT COUNT(*) as count FROM credit_notes WHERE note_number LIKE ?").get(`CN-${ym}-%`);
  const seq = String((countRow ? countRow.count : 0) + 1).padStart(4, '0');
  return `CN-${ym}-${seq}`;
}

// ── GET /api/credit-notes — List all credit notes ──
router.get('/', (req, res) => {
  const notes = db.prepare('SELECT * FROM credit_notes ORDER BY id DESC').all();
  res.json(notes);
});

// ── GET /api/credit-notes/lookup?phone= — Lookup active non-expired store credits ──
router.get('/lookup', (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  const notes = db.prepare(`
    SELECT * FROM credit_notes
    WHERE customer_phone = ? AND status = 'active' AND balance_remaining > 0
      AND (expires_at IS NULL OR expires_at > datetime('now'))
    ORDER BY id DESC
  `).all(phone.trim());

  const totalAvailable = notes.reduce((sum, n) => sum + Number(n.balance_remaining || 0), 0);
  res.json({ notes, total_available: Math.round(totalAvailable * 100) / 100 });
});

// ── POST /api/credit-notes — Issue new Credit Note (e.g. on return/exchange) ──
router.post('/', (req, res) => {
  const { customer_phone, customer_name, original_bill_number, amount, reason, validity_days = 90 } = req.body;

  if (!customer_phone || !amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Customer phone and positive amount are required' });
  }

  const noteNumber = generateNoteNumber();
  const amt = Math.round(Number(amount) * 100) / 100;
  const days = parseInt(validity_days, 10) || 90;
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

  const result = db.prepare(`
    INSERT INTO credit_notes (
      note_number, customer_phone, customer_name, original_bill_number,
      amount, balance_remaining, reason, status, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `).run(
    noteNumber,
    customer_phone.trim(),
    customer_name ? customer_name.trim() : null,
    original_bill_number ? original_bill_number.trim() : null,
    amt,
    amt,
    reason || 'Garment exchange / return credit',
    expiresAt
  );

  const note = db.prepare('SELECT * FROM credit_notes WHERE id = ?').get(result.lastInsertRowid);

  logAudit({
    cashier_id: req.cashier?.id,
    cashier_name: req.cashier?.name,
    action: 'issue_credit_note',
    entity_type: 'credit_note',
    entity_id: note.id,
    details: { note_number: noteNumber, amount: amt, customer_phone }
  });

  res.status(201).json(note);
});

// ── POST /api/credit-notes/redeem — Redeem credit note ──
router.post('/redeem', (req, res) => {
  const { note_number, amount_to_use } = req.body;
  if (!note_number || !amount_to_use) {
    return res.status(400).json({ error: 'note_number and amount_to_use required' });
  }

  const note = db.prepare('SELECT * FROM credit_notes WHERE note_number = ?').get(note_number);
  if (!note) return res.status(404).json({ error: 'Credit note not found' });

  // Check expiry
  if (note.expires_at && new Date(note.expires_at) < new Date()) {
    db.prepare("UPDATE credit_notes SET status = 'expired' WHERE id = ?").run(note.id);
    return res.status(400).json({ error: `Credit note ${note_number} expired on ${note.expires_at.slice(0, 10)}` });
  }

  if (note.status !== 'active' || note.balance_remaining <= 0) {
    return res.status(400).json({ error: 'Credit note has already been fully redeemed or is inactive' });
  }

  const useAmt = Math.round(Number(amount_to_use) * 100) / 100;
  if (useAmt > note.balance_remaining + 0.01) {
    return res.status(400).json({ error: `Amount exceeds available balance (₹${note.balance_remaining})` });
  }

  const newBalance = Math.max(0, Math.round((note.balance_remaining - useAmt) * 100) / 100);
  const newStatus = newBalance <= 0 ? 'redeemed' : 'active';

  db.prepare(`
    UPDATE credit_notes SET balance_remaining = ?, status = ? WHERE id = ?
  `).run(newBalance, newStatus, note.id);

  const updated = db.prepare('SELECT * FROM credit_notes WHERE id = ?').get(note.id);

  logAudit({
    cashier_id: req.cashier?.id,
    cashier_name: req.cashier?.name,
    action: 'redeem_credit_note',
    entity_type: 'credit_note',
    entity_id: note.id,
    details: { redeemed: useAmt, remaining: updated.balance_remaining }
  });

  res.json({
    success: true,
    redeemed: useAmt,
    remaining: updated.balance_remaining,
    note: updated
  });
});

module.exports = router;
