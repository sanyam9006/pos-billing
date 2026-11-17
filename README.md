# Aura Fashion Boutique POS & Inventory System

A production-ready, tax-inclusive billing, inventory, and procurement system built for Indian clothing boutiques (ready-made kurtis, sarees, co-ords, lehengas, and custom tailoring/alteration orders).

Built with **React 18 + Vite**, **Express.js**, and **SQLite (better-sqlite3)** in WAL mode.

---

## 💎 Core Boutique Features & Pricing Rules

1. **Strictly Tax-Inclusive Pricing (Indian Retail Principle):**
   - The customer pays **only the MRP / tag price**. Tax is **never added on top**.
   - `Grand Total = sum(selling_price × quantity) - discounts`.
   - Embedded GST is automatically extracted for accounting: `tax = price - price / (1 + rate)`.

2. **Per-Piece Apparel GST Slabs (HSN Chapters 61/62/63):**
   - **5% GST** for garments with effective per-piece value $\le$ ₹2,500.
   - **18% GST** for garments with effective per-piece value $>$ ₹2,500.
   - Discounts apply **before** slab evaluation (e.g., a ₹2,650 garment with a ₹200 discount becomes ₹2,450 effective price and moves to the 5% slab).
   - Configurable in the **Settings** page: Slabs, Thresholds, and the ₹2,625–₹2,950 edge-case rule (`TAG_PRICE` vs `TAXABLE_VALUE`) with a note for your CA.

3. **GST Mode (Registered vs. Unregistered):**
   - **Unregistered:** Prints **"Bill of Supply"** with no GSTIN, no tax breakdown columns, and no CGST/SGST.
   - **Registered:** Prints **"TAX INVOICE"** with Store GSTIN, State Code, HSN per line, Taxable Value, CGST + SGST (intra-state) or IGST (inter-state toggle).

4. **Garment Matrix & Variant Management:**
   - Multi-variant matrix generator for sizes (XS, S, M, L, XL, XXL) $\times$ colors (e.g. 16 SKUs generated in 1 click).
   - Barcode price tag generation with Code 128 barcodes and thermal printer formats.

5. **Garment Exchange & Store Credit Notes:**
   - Atomic exchange flow: return previous garments, pick replacements, and settle the net difference or issue credit notes.
   - Store credit notes with 90-day expiry tracking and mobile-number lookup at checkout.

6. **Custom Tailoring & Alteration Orders:**
   - Client measurements (bust, waist, hips, length, neck, etc.), fabric details, trial and delivery dates.
   - Advance payments, partial balance tracking, and printable tailoring job slips.

7. **Procurement & Purchase Orders:**
   - Vendor management, Purchase Orders (draft $\to$ ordered $\to$ received).
   - Idempotent and partial stock receiving with cost price tracking.

8. **Accountant Reports & GST Export:**
   - Daily Sales, Payment Mode Split (Cash, UPI, Card, Store Credit).
   - Top Sellers, Slow Movers (dead stock), Gross Profit (MRP vs Cost) & Margins.
   - One-click **GST CSV Export** for monthly CA filing.

---

## 🚀 Quick Start

### 1. Installation
```bash
# Clone and enter repo
cd pos-billing

# Install backend & frontend dependencies
npm install && cd client && npm install && cd ..
```

### 2. First-Run Setup & Configuration
```bash
# Start dev servers (Express API on 3001, Vite UI on 5173)
npm run dev
```
Open **[http://localhost:5173](http://localhost:5173)** in your browser.

- **Initial Owner Account:** `OWNER01` (PIN: `9999`)
- **Staff Cashier Account:** `EMP001` (PIN: `1234`)
- Manage store name, address, GSTIN, and printer width directly from **Settings (⚙️)** in the sidebar.

### 3. One-Click Desktop Launchers

- **Mac:** Double-click `launch-pos.sh` or use the Desktop App launcher.
- **Windows:** Double-click `launch-pos.bat`.

---

## 🛡️ Safety & Data Protection

- **Seed Protection:** `npm run seed` will **never** wipe real store data. If transactions or products exist, it halts and reports your current record counts. To reset demo data explicitly, pass:
  ```bash
  npm run seed -- --force
  ```
- **Automated Daily Backups:** On server startup, the database is backed up into `backups/pos_backup_<DATE>.db`.
- **One-Click Backup:** Owners can click **"Backup Database Now"** anytime from the **Settings** page.
- **Audit Trail:** All voids, refunds, bill-level discounts, stock edits, and price overrides are logged to `audit_logs`.

---

## 🧪 Testing & Verification

```bash
# Run 32 integration tests (Jest)
npm test

# Run code style & linter
npm run lint

# Build production client bundle
npm run build
```

---

## 📋 Role-Based Permissions

| Capability | Cashier | Boutique Owner / Supervisor |
|---|:---:|:---:|
| Create Bills & Scan Garments | ✅ | ✅ |
| UPI, Cash, Card, Credit Note Payments | ✅ | ✅ |
| Small Item Discounts (≤ ₹500) | ✅ | ✅ |
| Large Bill Discounts (> ₹500) | 🔒 Requires PIN | ✅ |
| Custom Tailoring Orders & Slips | ✅ | ✅ |
| Garment Exchange Flow | ✅ | ✅ |
| Refunds & Returns | ❌ | ✅ |
| Procurement & PO Receiving | ❌ | ✅ |
| GST Reports & CSV CA Export | ❌ | ✅ |
| Store Branding & Tax Settings | ❌ | ✅ |
| Database Backup & Audit Logs | ❌ | ✅ |
