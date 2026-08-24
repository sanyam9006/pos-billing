# 🏪 SuperMart POS Billing System

A modern, full-stack Point of Sale (POS) and inventory billing system built with React, Node.js, Express, and SQLite.

---

## 🎨 Theme & Palette

- **Background**: `#FAF7F2` (Soft warm off-white)
- **Surface / Card**: `#FFFFFF` with `1px solid #EDE7DD` border
- **Primary Accent**: `#5B9BD5` (Light, calm blue)
- **Accent Tint**: `#A8CDE8` (Pale powder blue for hovers & badges)
- **Secondary Accent**: `#C9A227` (Warm gold for totals & contrast)
- **Text Primary**: `#2B2622` (Warm near-black)
- **Text Muted**: `#7A7168` (Warm grey)
- **Corner Radius**: `10px`

---

## 🚀 Getting Started

### 1. Install & Seed
```bash
npm run setup
```
*(Installs dependencies for both server & client, and seeds the SQLite database)*

### 2. Run Locally
```bash
npm run dev
```
- **Frontend App**: `http://localhost:5173`
- **Backend API**: `http://localhost:3001`

---

## 🔑 Demo Cashier Logins

| Employee Code | PIN | Role |
| :--- | :--- | :--- |
| `EMP001` | `1234` | Cashier (Rahul Sharma) |
| `EMP002` | `5678` | Cashier (Priya Patel) |
| `EMP003` | `9999` | Supervisor (Amit Kumar) |

---

## 🌟 Key Features

- ⚡ **Instant Barcode Scanning & Live Search**: Scan barcodes or type product names.
- 🛒 **Dynamic Cart & Totals**: Auto-calculates Subtotal, GST, and Grand Total.
- 👤 **Customer & Loyalty Engine**: Link customer phone numbers to earn loyalty points.
- 🏷️ **Coupons & Discounts**: Apply percent or flat discount codes (`SAVE10`, `FLAT50`, `MEGA20`).
- ⏸️ **Hold & Recall Bills**: Put customer orders on hold and resume them anytime.
- 💳 **Multiple Payment Modes**: Cash (with change calculator), Card, UPI, and Split billing.
- 🧾 **Printable Thermal Receipts**: Clean printable thermal receipt formatted for store printers.
- 📊 **Standalone HTML Prototypes**: Single-file offline versions (`supermart_pos.html` & `supermart_admin.html`).

---

## 📁 Tech Stack

- **Frontend**: Vite + React 18, Custom CSS Design System
- **Backend**: Node.js, Express
- **Database**: SQLite (via `better-sqlite3` in WAL mode)
