const db = require('./db');
const { hashPin } = require('./utils/auth');

// Clear existing data
db.exec('DELETE FROM purchase_order_items');
db.exec('DELETE FROM purchase_orders');
db.exec('DELETE FROM suppliers');
db.exec('DELETE FROM payments');
db.exec('DELETE FROM transaction_items');
db.exec('DELETE FROM transactions');
db.exec('DELETE FROM coupons');
db.exec('DELETE FROM customers');
db.exec('DELETE FROM products');
db.exec('DELETE FROM cashiers');
db.exec('DELETE FROM bill_sequence');

// Reset auto-increment
db.exec("DELETE FROM sqlite_sequence");

// ── Cashiers (PINs are bcrypt-hashed) ──
const insertCashier = db.prepare('INSERT INTO cashiers (name, employee_code, pin, role) VALUES (?, ?, ?, ?)');
insertCashier.run('Rahul Sharma', 'EMP001', hashPin('1234'), 'cashier');
insertCashier.run('Priya Patel', 'EMP002', hashPin('5678'), 'cashier');
insertCashier.run('Amit Kumar', 'EMP003', hashPin('9999'), 'supervisor');

// ── Customers ──
const insertCustomer = db.prepare('INSERT INTO customers (name, phone, email, loyalty_points, membership_tier) VALUES (?, ?, ?, ?, ?)');
insertCustomer.run('Ananya Iyer', '9876543210', 'ananya@email.com', 342, 'Gold');
insertCustomer.run('Vikram Singh', '9876543211', 'vikram@email.com', 150, 'Silver');
insertCustomer.run('Sneha Reddy', '9876543212', 'sneha@email.com', 890, 'Platinum');
insertCustomer.run('Rohan Gupta', '9876543213', 'rohan@email.com', 50, 'Silver');
insertCustomer.run('Meera Nair', '9876543214', 'meera@email.com', 520, 'Gold');

// ── Coupons ──
const insertCoupon = db.prepare('INSERT INTO coupons (code, type, value, min_bill, max_discount, valid_from, valid_to, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
insertCoupon.run('SAVE10', 'percent', 10, 500, 200, '2026-01-01', '2026-12-31', 1);
insertCoupon.run('FLAT50', 'flat', 50, 300, null, '2026-01-01', '2026-12-31', 1);
insertCoupon.run('MEGA20', 'percent', 20, 1000, 500, '2026-03-01', '2026-04-30', 1);
insertCoupon.run('EXPIRED1', 'percent', 15, 200, 100, '2025-01-01', '2025-12-31', 0);

// ── Products ──
const insertProduct = db.prepare('INSERT INTO products (sku, barcode, name, category, mrp, selling_price, hsn_code, tax_rate, stock_qty, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

// Groceries & Staples
insertProduct.run('GRC001', '8901030793394', 'Tata Salt 1kg', 'Groceries', 28, 28, '2501', 5, 200, 'pcs');
insertProduct.run('GRC002', '8901030793400', 'Fortune Sunflower Oil 1L', 'Groceries', 185, 175, '1512', 5, 80, 'pcs');
insertProduct.run('GRC003', '8901030793401', 'Aashirvaad Atta 5kg', 'Groceries', 295, 280, '1101', 5, 60, 'pcs');
insertProduct.run('GRC004', '8901030793402', 'Tata Sampann Chana Dal 1kg', 'Groceries', 160, 152, '0713', 5, 100, 'pcs');
insertProduct.run('GRC005', '8901030793403', 'India Gate Basmati Rice 1kg', 'Groceries', 180, 170, '1006', 5, 90, 'pcs');
insertProduct.run('GRC006', '8901030793404', 'MDH Garam Masala 100g', 'Groceries', 85, 80, '0910', 5, 150, 'pcs');
insertProduct.run('GRC007', '8901030793405', 'Saffola Gold Oil 1L', 'Groceries', 199, 189, '1512', 5, 70, 'pcs');
insertProduct.run('GRC008', '8901030793406', 'Sugar (Sulphurless) 1kg', 'Groceries', 48, 45, '1701', 5, 200, 'pcs');

// Dairy
insertProduct.run('DRY001', '8901030793410', 'Amul Butter 500g', 'Dairy', 270, 270, '0405', 12, 50, 'pcs');
insertProduct.run('DRY002', '8901030793411', 'Mother Dairy Milk 1L', 'Dairy', 68, 66, '0401', 0, 100, 'pcs');
insertProduct.run('DRY003', '8901030793412', 'Amul Cheese Slices 200g', 'Dairy', 120, 115, '0406', 12, 60, 'pcs');
insertProduct.run('DRY004', '8901030793413', 'Epigamia Greek Yogurt 90g', 'Dairy', 45, 42, '0403', 5, 80, 'pcs');
insertProduct.run('DRY005', '8901030793414', 'Amul Paneer 200g', 'Dairy', 95, 90, '0406', 5, 40, 'pcs');

// Beverages
insertProduct.run('BEV001', '8901030793420', 'Bisleri Water 1L', 'Beverages', 20, 20, '2201', 18, 300, 'pcs');
insertProduct.run('BEV002', '8901030793421', 'Coca-Cola 750ml', 'Beverages', 40, 38, '2202', 18, 150, 'pcs');
insertProduct.run('BEV003', '8901030793422', 'Red Bull 250ml', 'Beverages', 125, 120, '2202', 18, 60, 'pcs');
insertProduct.run('BEV004', '8901030793423', 'Tata Tea Gold 500g', 'Beverages', 285, 270, '0902', 5, 80, 'pcs');
insertProduct.run('BEV005', '8901030793424', 'Nescafe Classic 100g', 'Beverages', 315, 299, '0901', 5, 50, 'pcs');
insertProduct.run('BEV006', '8901030793425', 'Paper Boat Aamras 200ml', 'Beverages', 30, 28, '2009', 12, 100, 'pcs');
insertProduct.run('BEV007', '8901030793426', 'Tropicana Orange Juice 1L', 'Beverages', 120, 110, '2009', 12, 45, 'pcs');

// Snacks
insertProduct.run('SNK001', '8901030793430', 'Maggi 4-Pack', 'Snacks', 56, 52, '1902', 12, 200, 'pcs');
insertProduct.run('SNK002', '8901030793431', 'Lays Classic Salted 52g', 'Snacks', 20, 20, '2005', 12, 250, 'pcs');
insertProduct.run('SNK003', '8901030793432', 'Kurkure Masala Munch 90g', 'Snacks', 20, 20, '1905', 12, 200, 'pcs');
insertProduct.run('SNK004', '8901030793433', 'Parle-G Biscuits 250g', 'Snacks', 25, 22, '1905', 12, 300, 'pcs');
insertProduct.run('SNK005', '8901030793434', 'Oreo Chocolate 120g', 'Snacks', 30, 30, '1905', 12, 150, 'pcs');
insertProduct.run('SNK006', '8901030793435', 'Haldiram Namkeen 200g', 'Snacks', 65, 60, '2006', 12, 100, 'pcs');
insertProduct.run('SNK007', '8901030793436', 'Dark Fantasy Choco 75g', 'Snacks', 40, 38, '1905', 12, 120, 'pcs');

// Personal Care
insertProduct.run('PRC001', '8901030793440', 'Dove Soap 100g', 'Personal Care', 55, 52, '3401', 18, 180, 'pcs');
insertProduct.run('PRC002', '8901030793441', 'Head & Shoulders Shampoo 340ml', 'Personal Care', 360, 340, '3305', 18, 40, 'pcs');
insertProduct.run('PRC003', '8901030793442', 'Colgate MaxFresh 150g', 'Personal Care', 95, 90, '3306', 18, 100, 'pcs');
insertProduct.run('PRC004', '8901030793443', 'Dettol Handwash 200ml', 'Personal Care', 55, 50, '3401', 18, 120, 'pcs');
insertProduct.run('PRC005', '8901030793444', 'Nivea Body Lotion 200ml', 'Personal Care', 215, 199, '3304', 18, 50, 'pcs');
insertProduct.run('PRC006', '8901030793445', 'Gillette Mach3 Razor', 'Personal Care', 350, 325, '8212', 18, 30, 'pcs');
insertProduct.run('PRC007', '8901030793446', 'Whisper Ultra Clean XL 30s', 'Personal Care', 340, 320, '9619', 12, 60, 'pcs');
insertProduct.run('PRC008', '8901030793447', 'Vaseline Petroleum Jelly 100ml', 'Personal Care', 125, 115, '2712', 18, 70, 'pcs');

// Household
insertProduct.run('HHL001', '8901030793450', 'Vim Dishwash Bar 200g', 'Household', 32, 30, '3402', 18, 200, 'pcs');
insertProduct.run('HHL002', '8901030793451', 'Surf Excel Matic 1kg', 'Household', 225, 210, '3402', 18, 70, 'pcs');
insertProduct.run('HHL003', '8901030793452', 'Lizol Floor Cleaner 500ml', 'Household', 115, 105, '3402', 18, 80, 'pcs');
insertProduct.run('HHL004', '8901030793453', 'Harpic Power Plus 500ml', 'Household', 98, 90, '3402', 18, 90, 'pcs');
insertProduct.run('HHL005', '8901030793454', 'Good Knight Liquid Refill', 'Household', 75, 68, '3808', 18, 100, 'pcs');
insertProduct.run('HHL006', '8901030793455', 'Scotch-Brite Scrub Pad 3s', 'Household', 45, 40, '7323', 18, 150, 'pcs');

// Frozen & Ready to Eat
insertProduct.run('FRZ001', '8901030793460', 'McCain French Fries 450g', 'Frozen', 145, 135, '2004', 12, 40, 'pcs');
insertProduct.run('FRZ002', '8901030793461', 'ITC Aashirvaad Paratha 4s', 'Frozen', 90, 85, '1905', 12, 50, 'pcs');
insertProduct.run('FRZ003', '8901030793462', 'Amul Ice Cream Vanilla 750ml', 'Frozen', 175, 165, '2105', 12, 30, 'pcs');

// Baby Care
insertProduct.run('BBY001', '8901030793470', 'Pampers Diapers M 20s', 'Baby Care', 420, 399, '9619', 12, 40, 'pcs');
insertProduct.run('BBY002', '8901030793471', 'Johnson Baby Powder 200g', 'Baby Care', 175, 165, '3304', 18, 50, 'pcs');
insertProduct.run('BBY003', '8901030793472', 'Cerelac Wheat 300g', 'Baby Care', 240, 225, '1901', 5, 35, 'pcs');

// Stationery/General
insertProduct.run('STN001', '8901030793480', 'Classmate Notebook 200pg', 'Stationery', 65, 60, '4820', 12, 100, 'pcs');
insertProduct.run('STN002', '8901030793481', 'Reynolds Pen Pack of 5', 'Stationery', 50, 45, '9608', 18, 80, 'pcs');

// ── Suppliers ──
const insertSupplier = db.prepare('INSERT INTO suppliers (name, contact_person, phone, email, gstin, address) VALUES (?, ?, ?, ?, ?, ?)');
insertSupplier.run('Apex Textiles & Apparels', 'Rajesh Mehta', '9820112233', 'apex@textiles.com', '27AABCA1122B1Z3', 'Plot 45, MIDC, Surat');
insertSupplier.run('Vogue Trends Wholesalers', 'Deepa Shah', '9833445566', 'vogue@trends.in', '27AABCV3344C1Z9', 'Gandhi Nagar, Delhi');
insertSupplier.run('Metro Retail Distributors', 'Suresh Reddy', '9844556677', 'metro@distributors.com', '29AABCM5566D1Z5', 'Peenya Industrial Area, Bengaluru');

console.log('✅ Database seeded successfully!');
console.log('   - 3 Cashiers');
console.log('   - 5 Customers');
console.log('   - 4 Coupons');
console.log('   - 50 Products across 8 categories');

process.exit(0);
