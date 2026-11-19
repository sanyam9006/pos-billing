# 👗 House of Sadaya — Boutique POS System
### Windows Setup Guide & Store Operations Manual

---

## 🚀 Part 1: First-Time Setup on Windows (Takes 3 Minutes)

### Step 1: Install Node.js (Prerequisite — Only required once)
Before running the POS, Windows needs the Node.js runtime:
1. Download Node.js from the official site:
   👉 **https://nodejs.org** *(Click the big green button: **LTS - Recommended for most users**)*.
2. Run the downloaded installer (`node-v20...msi`).
3. Click **Next ➔ Next ➔ Next ➔ Finish** (accept all standard defaults).

---

### Step 2: Extract the Project Folder
1. Right-click the `HouseOfSadaya-POS.zip` file on your Desktop.
2. Select **Extract All...** and click **Extract**.

---

### Step 3: Run the POS (`START-POS.bat`)
1. Open the extracted folder and double-click **`START-POS.bat`**.

#### ⚠️ If Windows shows the "Open File - Security Warning" dialog:
- Windows shows this for any downloaded script.
- **Uncheck** *"Always ask before opening this file"*.
- Click **Run**.
*(Alternative: Right-click `START-POS.bat` ➔ **Properties** ➔ Check **"Unblock"** at the bottom ➔ Click **OK**).*

2. A blue console window will appear:
   - On the **very first run**, it will automatically download necessary libraries (takes about 1–2 minutes).
   - Once ready, it automatically opens your web browser to:
     👉 **http://localhost:5173**

> 💡 **Everyday Convenience:** Right-click **`START-POS.bat`** ➔ **Send to** ➔ **Desktop (create shortcut)**. Every morning, just double-click that desktop icon to start your store POS!

---

## 🔐 Part 2: Staff Logins & Counter Passwords

| Role | Employee Code | PIN | Permissions |
| :--- | :--- | :--- | :--- |
| **👑 Boutique Owner** | **`OWNER01`** | **`9999`** | Full access: Settings, Add/Edit Staff, Pricing overrides, Bulk tag print, Analytics & P&L |
| **👑 Supervisor / Manager** | **`EMP003`** | **`9999`** | Full supervisor permissions, discount approvals, rental deposit overrides |
| **💼 Senior Cashier** | **`EMP001`** | **`1234`** | Daily billing, barcode scanning, customer checkout, exchange billing, rentals |
| **💼 Cashier** | **`EMP002`** | **`5678`** | Daily billing, barcode scanning, customer checkout, exchange billing, rentals |

### How to Add New Staff or Change Staff PINs:
1. Log in with **`OWNER01`** (PIN: `9999`).
2. Click **⚙️ Settings** in the top navigation bar.
3. Scroll down to **👥 Staff & Cashier Login Management**.
4. Click **`+ Add New Staff`** or click **`✏️ Edit / Change PIN`** next to any employee name.
5. Enter the new details and click **Save**.

---

## 🛍️ Part 3: Daily Store Operations Guide

### 1. Daily Sales & Billing (Point of Sale)
- **Using a Barcode Scanner**: Connect any USB handheld barcode scanner. Click the search box (or press `F2`) and scan garment tags. The item, size, color, and MRP will add to the bill automatically with audio confirmation.
- **Manual Search**: Type the garment name (e.g., `Anarkali`, `Mulmul`) or SKU code.
- **Customer Linking**: Enter customer phone number to accumulate loyalty points and pull existing customer profiles.
- **Checkout Modes**: Click **💵 Cash**, **📱 UPI (QR / PhonePe / GPay)**, or **💳 Card**.
- **Discounts**: Enter flat ₹ or percentage discount. If discount exceeds ₹500, a supervisor PIN popup will prompt for approval.
- **Receipts**: Prints professional receipts formatted for standard 80mm thermal receipt printers.

### 2. Inventory & Barcode Generation
- **Unique In-Store Barcodes**: Go to **👗 Products** ➔ **`+ Add Product`**. Click **`⚡ Generate Barcode`** to generate an official 13-digit EAN-13 barcode sequence starting with 2.
- **Matrix Variant Generator (Bulk S/M/L/XL)**:
  - Click **`⚡ Automated Batch / Matrix Variant Generator`**.
  - Type base product name (e.g., `Linen Kurti Set`) and category.
  - Select all sizes (`S`, `M`, `L`, `XL`) and colors (`Indigo Blue`, `Maroon`, `Beige`).
  - Click **`⚡ Generate Barcodes`** to create all 12 variants in 1 click with guaranteed collision-free unique barcodes!

### 3. Printing Real Barcode Price Tags
- On the **Products** screen, click **`🏷️ Tag`** next to any garment, or select multiple garments and click **`🖨️ Bulk Print Tags`**.
- Choose your label format:
  - **50 x 25 mm** (Standard boutique jewelry/garment roll)
  - **38 x 25 mm** (Compact roll)
  - **A4 Sheet** (Sheet of 24/30 labels for standard office laser/inkjet printers)
- Each tag includes: Boutique Name, Garment Name, Size & Color, MRP / Selling Price, and a high-resolution scannable barcode.

### 4. Bridal & Occasion Wear Rentals
- Click **💎 Rentals** in the top bar.
- **Bookings & Pickup**: Select garment, customer, rental period, and pricing mode (*Per Event* or *Per Day*).
- **Security Deposit**: Collect refundable security deposit and advance payment.
- **Returns**: When the customer returns the garment, click **Return Item**. The system automatically computes extra days, late fees (if any), and displays the net security deposit refund amount.

### 5. Tailoring & Custom Stitching
- Click **🪡 Custom Orders**.
- Enter customer body measurements (Bust, Waist, Shoulder, Sleeve, Length, Neck design notes).
- Set Trial Date, Delivery Date, advance received, and track order stages (`In Progress` ➔ `Trial Ready` ➔ `Delivered`).

### 6. Reports & Closing the Store (End of Day)
- Click **📊 Reports**:
  - **X-Report**: Check mid-day register balance at any time without closing the shift.
  - **Z-Report (End of Day)**: Print the daily closing statement showing total sales, Cash in Drawer, UPI receipts, and itemized sales timeline.
  - **Profit & Margin**: View gross margin %, revenue vs. garment cost, and highest grossing categories.

### 7. Stopping the System at Night
- To safely shut down background services at closing time, simply double-click **`STOP-POS.bat`** or close the terminal window.
