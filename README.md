# POS Billing System

A full-featured **Point of Sale** system built with **React + Node.js + SQLite**. Designed to work for **any retail business** — grocery, pharmacy, electronics, clothing, or any store that needs billing, inventory, and reporting.

## Features

| Feature | Status |
|---------|--------|
| 🛒 **Billing** — Scan/search products, cart management, coupons | ✅ |
| 📦 **Product Management** — CRUD, stock adjustment, soft-delete | ✅ |
| 👥 **Customer Management** — Registration, search, loyalty tiers | ✅ |
| 💰 **Payments** — Cash, Card, UPI with change calculation | ✅ |
| 🧾 **Receipts** — Printable thermal-style receipts with tax breakdown | ✅ |
| ↩️ **Returns & Refunds** — Process returns with stock restoration | ✅ |
| 📊 **Reports** — X/Z reports, daily sales, top products, low-stock alerts | ✅ |
| 🔐 **Security** — bcrypt PINs, JWT auth, role-based access, rate limiting | ✅ |
| 📈 **Dashboard** — Today's sales, payment breakdown, low-stock warnings | ✅ |
| ✅ **Tests** — 24 integration tests covering full business logic | ✅ |

## Quick Start

```bash
# 1. Install dependencies
npm install && cd client && npm install && cd ..

# 2. Configure your business (edit .env)
cp .env.example .env
# Set your STORE_NAME, STORE_ADDRESS, STORE_GSTIN, etc.

# 3. Seed the database
npm run seed

# 4. Start the app
npm run dev
# Frontend: http://localhost:5173
# Backend:  http://localhost:3001
```

**Demo login:** `EMP001` / `1234` (cashier) · `EMP003` / `9999` (supervisor)

## Configuration (.env)

All business-specific settings are externalized — no code changes needed:

```env
PORT=3001
JWT_SECRET=your-secret-key
STORE_NAME=Your Business Name
STORE_ADDRESS=Your Business Address
STORE_GSTIN=YOUR-GSTIN
STORE_PHONE=YOUR-PHONE
CURRENCY_SYMBOL=₹
BUSINESS_TYPE=retail
```

## Tech Stack

- **Frontend:** React 18, React Router, Vite
- **Backend:** Express.js, better-sqlite3
- **Auth:** bcrypt + JWT
- **Testing:** Jest + Supertest

## Project Structure

```
├── client/
│   └── src/
│       ├── components/Layout.jsx   # Sidebar navigation
│       ├── pages/
│       │   ├── Login.jsx           # Employee authentication
│       │   ├── Dashboard.jsx       # Sales overview & alerts
│       │   ├── Billing.jsx         # Main POS billing screen
│       │   ├── Products.jsx        # Product CRUD & stock management
│       │   ├── Customers.jsx       # Customer list & registration
│       │   ├── Reports.jsx         # Sales reports & analytics
│       │   └── Refunds.jsx         # Returns processing
│       └── utils/api.js            # Shared auth fetch & helpers
├── server/
│   ├── index.js                    # Express app + route mounting
│   ├── db.js                       # SQLite schema
│   ├── seed.js                     # Sample data
│   ├── routes/                     # API endpoints
│   │   ├── auth.js, products.js, transactions.js,
│   │   ├── payments.js, customers.js, refunds.js, reports.js
│   ├── utils/auth.js               # bcrypt, JWT, middleware
│   └── middleware/errorHandler.js   # Centralized error handling
├── tests/billing.test.js           # 24 integration tests
└── .env                            # Business configuration
```

## Role-Based Access

| Action | Cashier | Supervisor |
|--------|---------|------------|
| Billing & payments | ✅ | ✅ |
| View products | ✅ | ✅ |
| Create/edit/delete products | ❌ | ✅ |
| Process refunds | ❌ | ✅ |
| View reports | ❌ | ✅ |
| Dashboard analytics | Basic | Full |

## Scripts

```bash
npm run dev      # Start both servers (frontend + backend)
npm run server   # Backend only
npm run client   # Frontend only
npm run seed     # Reset database with sample data
npm test         # Run 24 integration tests
npm run lint     # ESLint check
```

## License

MIT
