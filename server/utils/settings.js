const db = require('../db');

function getSetting(key, fallback) {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (row && row.value !== undefined && row.value !== null) {
      return row.value;
    }
  } catch (_) {}
  return process.env[key] !== undefined ? process.env[key] : fallback;
}

module.exports = {
  getSetting
};
