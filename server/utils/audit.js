const db = require('../db');

function logAudit({ cashier_id, cashier_name, action, entity_type, entity_id, details }) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (cashier_id, cashier_name, action, entity_type, entity_id, details_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      cashier_id || null,
      cashier_name || 'System',
      action,
      entity_type || null,
      entity_id ? String(entity_id) : null,
      details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

module.exports = { logAudit };
