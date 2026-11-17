require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { authMiddleware } = require('./utils/auth');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Public routes (no auth required)
app.use('/api/auth', require('./routes/auth'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Store config (public — used by frontend for branding)
app.get('/api/config', (req, res) => {
  res.json({
    store_name: process.env.STORE_NAME || 'My Business',
    store_address: process.env.STORE_ADDRESS || '',
    store_phone: process.env.STORE_PHONE || '',
    store_gstin: process.env.STORE_GSTIN || '',
    currency_symbol: process.env.CURRENCY_SYMBOL || '₹',
    business_type: process.env.BUSINESS_TYPE || 'retail',
  });
});

// Protected routes (auth required)
app.use('/api/products', authMiddleware, require('./routes/products'));
app.use('/api/transactions', authMiddleware, require('./routes/transactions'));
app.use('/api/payments', authMiddleware, require('./routes/payments'));
app.use('/api/customers', authMiddleware, require('./routes/customers'));
app.use('/api/refunds', authMiddleware, require('./routes/refunds'));
app.use('/api/reports', authMiddleware, require('./routes/reports'));

// Centralized error handling (must be last)
app.use(errorHandler);

// Start server only when run directly (not when imported for tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 POS Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
