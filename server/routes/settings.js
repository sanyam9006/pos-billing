const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireRole } = require('../utils/auth');
const { logAudit } = require('../utils/audit');
const { performBackup } = require('../utils/backup');

// ── GET /api/settings — Get all settings ──
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value, description, updated_at FROM settings').all();
  const settingsObj = {};
  rows.forEach(r => {
    settingsObj[r.key] = r.value;
  });
  res.json({ settings: settingsObj, details: rows });
});

// ── PUT /api/settings — Update settings (supervisor only) ──
router.put('/', requireRole('supervisor'), (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Settings object required' });
  }

  const updateStmt = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);

  const saveTxn = db.transaction(() => {
    for (const [key, val] of Object.entries(updates)) {
      if (val !== undefined && val !== null) {
        updateStmt.run(key, String(val));
      }
    }
  });

  saveTxn();

  logAudit({
    cashier_id: req.cashier.id,
    cashier_name: req.cashier.name,
    action: 'update_settings',
    entity_type: 'settings',
    details: updates
  });

  const updatedRows = db.prepare('SELECT key, value FROM settings').all();
  const result = {};
  updatedRows.forEach(r => { result[r.key] = r.value; });

  res.json({ success: true, message: 'Settings saved successfully', settings: result });
});

// ── POST /api/settings/backup-now — Trigger on-demand backup (supervisor only) ──
router.post('/backup-now', requireRole('supervisor'), (req, res) => {
  const backupFile = performBackup();
  if (backupFile) {
    logAudit({
      cashier_id: req.cashier.id,
      cashier_name: req.cashier.name,
      action: 'manual_backup',
      entity_type: 'database',
      details: { backupFile }
    });
    res.json({ success: true, message: 'Database backup created successfully', file: backupFile });
  } else {
    res.status(500).json({ error: 'Failed to create database backup' });
  }
});

module.exports = router;
