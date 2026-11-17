require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { authMiddleware } = require('./utils/auth');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const path = require('path');
const fs = require('fs');

// Public routes (no auth required)
app.use('/api/auth', require('./routes/auth'));

// Static client assets if built (for seamless single-port access on :3001)
const clientDistPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
}
const clientPublicPath = path.join(__dirname, '../client/public');
if (fs.existsSync(clientPublicPath)) {
  app.use(express.static(clientPublicPath));
}

const { getSetting } = require('./utils/settings');
const { STORE_LOGO_BASE64 } = require('./utils/logo');

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Store config (public — used by frontend for branding)
app.get('/api/config', (req, res) => {
  res.json({
    store_name: getSetting('STORE_NAME', 'House of Sadaya'),
    store_address: getSetting('STORE_ADDRESS', '4/8 Housing board Tonk Rajasthan'),
    store_phone: getSetting('STORE_PHONE', '7568458575'),
    store_logo: getSetting('STORE_LOGO', STORE_LOGO_BASE64),
    currency_symbol: '₹',
    business_type: 'boutique',
    bill_prefix: getSetting('BILL_PREFIX', 'HOS-'),
    thermal_width: getSetting('THERMAL_WIDTH', '80mm'),
    footer_text: getSetting('FOOTER_TEXT', 'Thank you for shopping at House of Sadaya! Exchange within 7 days with tag intact.')
  });
});

// Protected routes (auth required)
app.use('/api/products', authMiddleware, require('./routes/products'));
app.use('/api/transactions', authMiddleware, require('./routes/transactions'));
app.use('/api/payments', authMiddleware, require('./routes/payments'));
app.use('/api/customers', authMiddleware, require('./routes/customers'));
app.use('/api/refunds', authMiddleware, require('./routes/refunds'));
app.use('/api/reports', authMiddleware, require('./routes/reports'));
app.use('/api/suppliers', authMiddleware, require('./routes/suppliers'));
app.use('/api/purchase-orders', authMiddleware, require('./routes/purchaseOrders'));
app.use('/api/custom-orders', authMiddleware, require('./routes/customOrders'));
app.use('/api/credit-notes', authMiddleware, require('./routes/creditNotes'));
app.use('/api/rentals', authMiddleware, require('./routes/rentals'));
app.use('/api/settings', authMiddleware, require('./routes/settings'));

// ── Database Backup (supervisor only) ──
const { performBackup } = require('./utils/backup');
const { requireRole } = require('./utils/auth');
app.post('/api/backup', authMiddleware, requireRole('supervisor'), (req, res) => {
  const backupFile = performBackup();
  if (backupFile) {
    res.json({ success: true, message: 'Database backup created successfully', file: backupFile });
  } else {
    res.status(500).json({ error: 'Failed to create database backup' });
  }
});

// SPA fallback: Serve frontend index.html if built, otherwise redirect to Vite dev server
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const indexHtml = path.join(clientDistPath, 'index.html');
  if (fs.existsSync(indexHtml)) {
    return res.sendFile(indexHtml);
  }
  res.redirect('http://localhost:5173');
});

// Centralized error handling (must be last)
app.use(errorHandler);

// Start server only when run directly (not when imported for tests)
if (require.main === module) {
  performBackup();
  app.listen(PORT, () => {
    console.log(`🚀 POS Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
