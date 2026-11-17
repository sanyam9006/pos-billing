const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'pos.db');
const backupsDir = path.join(__dirname, '..', '..', 'backups');

function performBackup() {
  try {
    if (!fs.existsSync(dbPath)) return null;
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const today = new Date().toISOString().slice(0, 10);
    const backupFile = path.join(backupsDir, `pos-backup-${today}.db`);

    // Copy file
    fs.copyFileSync(dbPath, backupFile);
    return backupFile;
  } catch (err) {
    console.error('Backup error:', err);
    return null;
  }
}

module.exports = { performBackup };
