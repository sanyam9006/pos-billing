# Comprehensive System Audit: POS Billing System to Boutique Transformation

Date: November 17, 2026  
Target Business: Indian Ready-Made Garments & Custom Tailoring Boutique  
Stack: React 18, Vite, Node.js/Express, SQLite (`better-sqlite3`)

---

## 1. Executive Summary

The current codebase is a transitional system with remnants from an initial generic supermarket/grocery concept ("SuperMart"), mixed with recent additions for clothing variants and tailoring. To become a reliable, production-ready boutique billing and inventory system for an Indian clothing boutique, several architectural, taxation, domain, and security flaws must be fixed.

---

## 2. Detailed Findings & Flaws

### 2.1 Tax & GST Logic
- **Exclusive Tax Residue:** Existing code still contains pathways where tax was added on top of the selling price (`grand_total = subtotal + tax`). For a boutique, retail clothing tag prices are strictly **GST-inclusive**. The customer must pay only the tag/MRP price.
- **Incorrect GST Slab & Threshold:** Indian apparel GST (HSN chapters 61/62/63) follows a per-piece slab:
  - 5% for per-piece sale value up to ₹2,500
  - 18% for per-piece sale value above ₹2,500
  The previous threshold in code was hard-coded at ₹1,000 (an outdated slab) and did not dynamically account for post-discount piece prices.
- **Inclusive Price Circularity Edge Case:** When an inclusive price falls between ₹2,625 and ₹2,950, evaluating on taxable value at 5% vs 18% causes a circular tax calculation. This needs to be a configurable setting (`SLAB_BASED_ON: 'TAG_PRICE' | 'TAXABLE_VALUE'`) with clear documentation for the owner's Chartered Accountant (CA).
- **No GST_MODE Support:** Boutiques below the GST threshold (₹40 lakhs turnover) or under composition scheme operate as unregistered/composition dealers and must issue a "Bill of Supply" without GSTIN or tax lines. The current system had no switch between `registered` (Tax Invoice with CGST/SGST/IGST breakdown) and `unregistered` (Bill of Supply).
- **No Inter-State (IGST) Support:** Intra-state transactions split GST into 50% CGST + 50% SGST. Inter-state sales require integrated tax (IGST) at the full rate.
- **Missing CSV Export for CA:** The accountant needs monthly GST reports grouped by rate (5% vs 18%) with taxable value, CGST, SGST, IGST, and total invoice amounts exportable to CSV.

### 2.2 Supermarket Leftovers & Domain Mismatch
- **Grocery Seed Data:** `server/seed.js` still populated 50 grocery items (Tata Salt, Fortune Oil, Amul Butter, McCain French Fries, Pampers, Harpic).
- **Hard-coded "SM-" Bill Prefix:** Bill number generation in `server/routes/transactions.js` hardcodes `SM-YYYYMMDD-XXXX` (SuperMart). Should use a configurable boutique prefix (e.g., `AB-` for Aura Boutique).
- **Supermarket Branding & Prototypes:** Unused static prototypes (`prototypes/app.html`, `supermart_pos.html`, `supermart_admin.html`) still reside in the repository. Fallback strings in `server/routes/payments.js` still reference `SUPERMART RETAIL PVT LTD`.
- **Measurement / Tailoring Gaps:** Although tailoring models were recently introduced, they need a complete workflow: fabric details, trial dates, delivery dates, advance payment, pending balance list, and printable job cards.

### 2.3 Variants & Inventory Management
- **Variant Selection at Billing:** While the variant generator can batch-create SKUs, the billing screen lacks rapid visual selection of size/color buttons when a customer brings an un-barcoded garment to the counter.
- **Garment Exchange Flow:** In clothing retail, size and color exchanges are far more frequent than cash refunds. A dedicated exchange flow (returning Item A, buying Item B, calculating the difference or issuing a Credit Note) is required.
- **Procurement & Purchase Orders:** Partial receipts (receiving 15 out of 20 garments shipped) and idempotent inventory updates were incomplete.

### 2.4 Safety, Security & Architecture
- **Destructive Seed Script:** `npm run seed` executes unconditional `DELETE FROM ...` across all tables. Running this on a live production computer wipes real sales and inventory. A safety guard requiring `--force` and displaying the count of live records to be deleted is mandatory.
- **Default JWT Secret & Hardcoded Demo PINs:** The server uses `supermart-pos-secret-change-in-production` as fallback. If an employee code/PIN `EMP001/1234` is deployed, anyone can access the till. Production must refuse to start with weak defaults and provide a first-run setup wizard.
- **Missing SQLite Settings Table:** Configuration parameters (`GST_MODE`, `STORE_NAME`, `STORE_GSTIN`, `STORE_ADDRESS`, `BILL_PREFIX`, `SLAB_THRESHOLD`, `DISCOUNT_LIMIT`) currently depend on `.env` files, which boutique staff cannot edit. A database-backed `settings` table with a UI page is necessary.
- **Audit Logging:** Critical financial events (voids, returns, discount overrides, manual stock edits) have no persistent audit trail. An `audit_logs` table is required.
- **Cross-Platform Launcher:** `launch-pos.sh` needed POSIX compliance and relative directory resolution; a Windows counterpart (`launch-pos.bat`) was missing.

---

## 3. Remediation Roadmap

1. **Database & Configuration (`server/db.js`, `server/routes/settings.js`)**:
   - Create `settings`, `audit_logs`, `credit_notes`, and update `custom_orders` and `purchase_orders`.
   - Seed boutique settings (`GST_MODE`, `STORE_NAME`, `BILL_PREFIX`, `GARMENT_TAX_THRESHOLD=2500`).
2. **Tax Engine (`server/utils/tax.js`)**:
   - Implement strict tax-inclusive math (`grand_total = subtotal - discounts`).
   - Slabs: 5% up to ₹2,500; 18% above ₹2,500 per piece.
   - Extract embedded tax: `tax = price - price / (1 + rate)`.
   - CGST/SGST (intra-state) vs IGST (inter-state).
   - Documented threshold edge case setting.
3. **Boutique Seed & Safety (`server/seed.js`, `server/seed-boutique.js`)**:
   - Replace groceries with boutique inventory (Kurtis, Sarees, Co-ord sets, Lehengas, Fabrics).
   - Strict safety guard preventing execution if live transactions exist.
4. **Billing, Exchange & Credit Notes (`server/routes/transactions.js`, `creditNotes.js`)**:
   - Implement one-step exchange transaction flow.
   - Credit note redemption and balance tracking.
   - Staff discount limits with owner PIN approval for high discounts.
5. **Tailoring & Custom Orders (`server/routes/customOrders.js`, `CustomOrders.jsx`)**:
   - Job cards, advance payment, pending balance list, delivery tracker.
6. **Hardware & Printing**:
   - 58mm/80mm thermal receipt generator (Tax Invoice vs Bill of Supply).
   - Barcode label sticker generator with standard Code128 format.
7. **Testing & Verification**:
   - 100% test coverage for GST slabs, discounts across thresholds, inclusive extraction, exchanges, tailoring, and backups.
