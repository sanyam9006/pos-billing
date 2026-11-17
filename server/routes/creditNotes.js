const express = require('express');
const router = express.Router();
const db = require('../db');

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

// ── GET /api/credit-notes/lookup?phone= — Lookup active store credits ──
router.get('/lookup', (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  const notes = db.prepare(`
    SELECT * FROM credit_notes
    WHERE customer_phone = ? AND status = 'active' AND balance_remaining > 0
    ORDER BY id DESC
  `).all(phone.trim());

  const totalAvailable = notes.reduce((sum, n) => sum + n.balance_remaining, 0);
  res.json({ notes, total_available: totalAvailable });
});

// ── POST /api/credit-notes — Issue new Credit Note (e.g. on return/exchange) ──
router.post('/', (req, res) => {
  const { customer_phone, customer_name, original_bill_number, amount, reason } = req.body;

  if (!customer_phone || !amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Customer phone and positive amount are required' });
  }

  const noteNumber = generateNoteNumber();
  const amt = Number(amount);

  const result = db.prepare(`
    INSERT INTO credit_notes (
      note_number, customer_phone, customer_name, original_bill_number,
      amount, balance_remaining, reason, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
  `).run(
    noteNumber,
    customer_phone.trim(),
    customer_name ? customer_name.trim() : null,
    original_bill_number ? original_bill_number.trim() : null,
    amt,
    amt,
    reason || 'Garment exchange / return credit'
  );

  const note = db.prepare('SELECT * FROM credit_notes WHERE id = ?').get(result.lastInsertRowid);
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
  if (note.status !== 'active' || note.balance_remaining <= 0) {
    return res.status(400).json({ error: 'Credit note has already been fully redeemed or is inactive' });
  }

  const useAmt = Number(amount_to_use);
  if (useAmt > note.balance_remaining) {
    return res.status(400).json({ error: `Amount exceeds available balance (₹${note.balance_remaining})` });
  }

  const newBalance = Math.round((note.balance_remaining - useAmt) * 100) / 100;
  const newStatus = newBalance <= 0 ? 'redeemed' : 'active';

  db.prepare(`
    UPDATE credit_notes SET balance_remaining = ?, status = ? WHERE id = ?
  `).run(newBalance, newStatus, note.id);

  const updated = db.prepare('SELECT * FROM credit_notes WHERE id = ?').get(note.id);
  res.json({
    success: true,
    redeemed: useAmt,
    remaining: updated.balance_remaining,
    note: updated
  });
});

module.exports = router;
